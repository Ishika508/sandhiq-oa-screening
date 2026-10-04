"""
MEDHA OA — screening support service.

Wraps the deployed EfficientNet-B0 Kellgren-Lawrence model
(MEDHA_OA_DEPLOY/model/medha_oa_kl_final.keras) in a small HTTP service so
the Next.js dashboard can call it, and hosts the live sensor gateway so the
wearable IMUs and the grip load cell can feed the screening steps.

Design notes
------------
* The model is loaded ONCE at startup and reused. Loading costs ~1 s and
  ~37 MB of weights; reloading per request would be unacceptable.
* Preprocessing and the horizontal-flip TTA (0.30 original + 0.70 flipped)
  come straight from the package's own `inference/inference.py`, which this
  service imports rather than re-exports. That guarantees predictions are
  byte-identical to the reference implementation the model was validated
  with — the reported 60.57% test accuracy only means something if the
  inference path is the same one that was measured.
* Keras `predict` is not safe to call concurrently on CPU, so every call is
  serialised behind a lock.
* `/metadata` exposes the held-out evaluation report so the UI can disclose
  real model performance (including the poor KL1 recall) rather than
  presenting a bare number as if it were reliable.
* The sensor gateway (`sensor_gateway`) opens UDP 5005/5006 for the two
  ESP8266 IMU nodes and decodes each frame into `imu_balance.INGEST`. Only
  those two datagram sockets reach the network; the HTTP API below stays on
  loopback, so nothing unauthenticated is exposed on the LAN.

Run:
    .venv\\Scripts\\python.exe ml\\server.py
"""

from __future__ import annotations

import io
import json
import os
import socket
import sys
import threading
import time
import base64
from typing import Any

import numpy as np
from flask import Flask, jsonify, request
from PIL import Image, UnidentifiedImageError

# sensor_gateway / imu_balance sit next to this file.
_ML_DIR = os.path.dirname(os.path.abspath(__file__))
if _ML_DIR not in sys.path:
    sys.path.insert(0, _ML_DIR)

# --------------------------------------------------------------------------
# Locate the deployed package
# --------------------------------------------------------------------------
# MEDHA_OA_DEPLOY may sit next to this repo, or be pointed at explicitly.
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(_HERE)

DEPLOY_ROOT = os.environ.get("MEDHA_DEPLOY_ROOT") or os.path.join(
    os.path.dirname(_REPO), "MEDHA_OA_DEPLOY"
)
if not os.path.isdir(DEPLOY_ROOT):
    # Fall back to the well-known Downloads location before giving up.
    _fallback = os.path.join(os.path.expanduser("~"), "Downloads", "MEDHA_OA_DEPLOY")
    if os.path.isdir(_fallback):
        DEPLOY_ROOT = _fallback

INFERENCE_DIR = os.path.join(DEPLOY_ROOT, "inference")
MODEL_PATH = os.environ.get("MEDHA_MODEL_PATH") or os.path.join(
    DEPLOY_ROOT, "model", "medha_oa_kl_final.keras"
)
EVAL_PATH = os.path.join(DEPLOY_ROOT, "evaluation", "complete_evaluation.json")

if INFERENCE_DIR not in sys.path:
    sys.path.insert(0, INFERENCE_DIR)

PORT = int(os.environ.get("MEDHA_ML_PORT", "8000"))
# 127.0.0.1 by default: the service has no authentication and accepts uploads,
# so it must not be exposed on the LAN unless deliberately configured.
HOST = os.environ.get("MEDHA_ML_HOST", "127.0.0.1")

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "BMP", "TIFF", "WEBP"}

# Grad-CAM overlay on /predict. Needs matplotlib; if it is missing the route
# still returns the prediction and simply omits the overlay.
GRADCAM_ENABLED = os.environ.get("MEDHA_GRADCAM", "1") not in ("0", "false", "no")

KL_MEANING = {
    "KL0": "No radiographic OA",
    "KL1": "Doubtful / very early change",
    "KL2": "Mild OA",
    "KL3": "Moderate OA",
    "KL4": "Severe OA",
}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

# --------------------------------------------------------------------------
# Live sensor gateway
# --------------------------------------------------------------------------
# The two ESP8266 IMU nodes stream 36-byte frames to UDP 5005 (thigh) and
# 5006 (shank). Every decoded frame is appended to a rolling window that
# /api/imu/trial scores. Startup is best-effort: if a port is taken or a
# dependency is missing, the HTTP service must still serve X-ray grading.
import imu_balance  # noqa: E402
import sensor_gateway  # noqa: E402

_gateway_started = False
_gateway_error: str | None = None

# The IMU step asks for a full 8-second hold; allow one node to be missing so
# a half-fitted setup still produces a (clearly disclosed) result.
IMU_TRIAL_MIN_FRAMES = int(os.environ.get("MEDHA_IMU_MIN_FRAMES", "10"))
IMU_TRIAL_REQUIRE_ALL = os.environ.get("MEDHA_IMU_REQUIRE_BOTH", "0") not in ("0", "false", "no")


def _on_imu(sensor_key: str, frame: dict) -> None:
    """Gateway callback: one decoded frame into the scoring window."""
    imu_balance.INGEST.push(sensor_key, frame)


_latest_grip: dict[str, Any] = {"kg": 0.0, "t": None}


def _on_grip(weight_kg: float) -> None:
    """Gateway callback: filtered load-cell weight. No-op unless HX711 exists."""
    _latest_grip["kg"] = float(weight_kg)
    _latest_grip["t"] = time.time()


def _start_sensor_gateway() -> None:
    global _gateway_started, _gateway_error
    try:
        _gateway_started = bool(sensor_gateway.start(on_imu=_on_imu, on_grip=_on_grip))
        if not _gateway_started and sensor_gateway.ENABLE:
            _gateway_error = "gateway did not start (already running or disabled)"
    except Exception as exc:  # noqa: BLE001 - never block the X-ray service
        _gateway_error = str(exc)
        print(f"[medha-ml] sensor gateway failed to start: {exc}", flush=True)


def _lan_hints() -> list[str]:
    """Every private IPv4 address this host owns, best candidate first.

    A single "route to 8.8.8.8" guess is not enough: a machine commonly has a
    WiFi address on one subnet and a wired address on another (e.g. a laptop on
    campus WiFi at 10.x while an Ethernet link to the local network sits at
    192.168.x). Guessing wrong sends the operator to an address the sensors
    cannot reach, which looks identical to a dead sensor. So report them all,
    and let MEDHA_LAN_IP pin the right one.
    """
    import ipaddress

    override = (os.environ.get("MEDHA_LAN_IP") or "").strip()
    found: list[str] = []

    def add(addr: str) -> None:
        try:
            ip = ipaddress.IPv4Address(addr)
        except ipaddress.AddressValueError:
            return
        if ip.is_loopback or ip.is_link_local or not ip.is_private:
            return
        if str(ip) not in found:
            found.append(str(ip))

    # Interface that would route to the outside world.
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            add(s.getsockname()[0])
        finally:
            s.close()
    except OSError:
        pass

    # Addresses the resolver reports for this hostname.
    try:
        for addr in socket.gethostbyname_ex(socket.gethostname())[2]:
            add(addr)
    except OSError:
        pass

    if override:
        return [override]
    return found


def _lan_hint() -> str | None:
    """Best single guess, for compact display."""
    hints = _lan_hints()
    return hints[0] if hints else None

# --------------------------------------------------------------------------
# Model lifecycle
# --------------------------------------------------------------------------
_model: Any = None
_model_error: str | None = None
_predict_lock = threading.Lock()
_warm_seconds: float | None = None


def get_model():
    """Load the model on first use. Raises RuntimeError with a usable message."""
    global _model, _model_error
    if _model is not None:
        return _model
    if _model_error is not None:
        raise RuntimeError(_model_error)

    if not os.path.isfile(MODEL_PATH):
        _model_error = f"Model file not found at {MODEL_PATH}"
        raise RuntimeError(_model_error)

    try:
        # Importing TensorFlow is slow; keep it out of module import time so
        # the health endpoint can answer while it is still loading.
        from inference import load_model  # type: ignore

        _model = load_model(MODEL_PATH)
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller
        _model_error = f"Failed to load model: {exc}"
        raise RuntimeError(_model_error) from exc
    return _model


def warm_up() -> None:
    """Run one throwaway prediction so the first real request is not slow."""
    global _warm_seconds
    try:
        from inference import predict_xray  # type: ignore

        model = get_model()
        t0 = time.time()
        # A mid-grey 224x224 image: we only care about graph tracing here.
        dummy = np.full((224, 224, 3), 128, dtype=np.uint8)
        predict_xray(dummy, model=model)
        _warm_seconds = time.time() - t0
        print(f"[medha-ml] warm-up complete in {_warm_seconds:.2f}s", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[medha-ml] warm-up failed: {exc}", flush=True)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _decode_image(data: bytes) -> tuple[np.ndarray, str]:
    if not data:
        raise ValueError("No image data received.")
    try:
        img = Image.open(io.BytesIO(data))
        fmt = (img.format or "").upper()
        img.load()  # force decode so truncated files fail here, not later
    except UnidentifiedImageError as exc:
        raise ValueError("That file is not a readable image.") from exc
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Could not decode the image: {exc}") from exc

    if fmt and fmt not in ALLOWED_FORMATS:
        raise ValueError(f"Unsupported image format '{fmt}'. Use JPEG or PNG.")

    # EXIF rotation matters a lot for X-rays: a sideways film fed to the model
    # degrades the grade. Pillow only transposes when asked.
    try:
        from PIL import ImageOps

        img = ImageOps.exif_transpose(img)
    except Exception:  # noqa: BLE001 - best effort only
        pass

    rgb = img.convert("RGB")
    return np.array(rgb), fmt


def _read_upload() -> bytes:
    """Accept either multipart/form-data or a raw image body."""
    if request.files:
        for key in ("file", "image", "xray"):
            if key in request.files:
                return request.files[key].read()
        # Any file part at all is fine.
        for _, storage in request.files.items():
            return storage.read()

    if request.data:
        return request.data

    raise ValueError("No image was uploaded.")


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@app.get("/health")
def health():
    loaded = _model is not None
    err = _model_error
    if not loaded and err is None:
        # Probing without forcing a full load keeps health checks cheap.
        loaded = os.path.isfile(MODEL_PATH)
    return jsonify(
        {
            "service": "medha-oa-ml",
            "model": os.path.basename(MODEL_PATH),
            "modelPath": MODEL_PATH,
            "modelLoaded": loaded,
            "error": err,
            "warmSeconds": _warm_seconds,
            "deployRoot": DEPLOY_ROOT,
            # A missing X-ray model must not look like a dead service: the
            # sensor gateway is independent and can be fully live.
            "gateway": {
                "started": _gateway_started,
                "error": _gateway_error,
                "enabled": bool(sensor_gateway.ENABLE),
                "ports": {"thigh": sensor_gateway.THIGH_PORT,
                          "shank": sensor_gateway.SHANK_PORT},
                "devices": sensor_gateway.IMU_DEVICE,
                "buffered": imu_balance.INGEST.counts(),
            },
        }
    ), (200 if loaded and not err else 503)


@app.get("/metadata")
def metadata():
    """Held-out evaluation report, so the UI can disclose real performance."""
    payload: dict[str, Any] = {
        "klMeaning": KL_MEANING,
        "tta": {"originalWeight": 0.3, "horizontalFlipWeight": 0.7},
        "architecture": "EfficientNet-B0",
        "inputShape": [224, 224, 3],
        "evaluation": None,
        "perClass": [],
    }
    if os.path.isfile(EVAL_PATH):
        try:
            with open(EVAL_PATH, "r", encoding="utf-8") as fh:
                ev = json.load(fh)
            payload["evaluation"] = ev

            # complete_evaluation.json is flat, with classification_report keyed
            # as "KL 0".."KL 4". Normalise to a list the UI can render.
            report = ev.get("classification_report") or {}
            for i in range(5):
                node = report.get(f"KL {i}") or {}
                payload["perClass"].append(
                    {
                        "kl": i,
                        "label": f"KL{i}",
                        "meaning": KL_MEANING.get(f"KL{i}", ""),
                        "precision": node.get("precision"),
                        "recall": node.get("recall"),
                        "f1": node.get("f1-score"),
                        "support": node.get("support"),
                    }
                )
            payload["summary"] = {
                "model": ev.get("model"),
                "testSamples": ev.get("test_samples"),
                "accuracy": ev.get("accuracy"),
                "macroF1": ev.get("macro_f1"),
                "weightedF1": ev.get("weighted_f1"),
            }
        except Exception as exc:  # noqa: BLE001
            payload["evaluationError"] = str(exc)
    return jsonify(payload)


@app.post("/predict")
def predict():
    try:
        data = _read_upload()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if len(data) > MAX_UPLOAD_BYTES:
        return jsonify({"error": "Image is too large (limit 20 MB)."}), 413

    try:
        array, fmt = _decode_image(data)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        model = get_model()
    except RuntimeError as exc:
        return jsonify({"error": str(exc), "code": "MODEL_UNAVAILABLE"}), 503

    from inference import predict_xray  # type: ignore

    t0 = time.time()
    try:
        with _predict_lock:
            result = predict_xray(array, model=model)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Inference failed: {exc}"}), 500
    elapsed_ms = int((time.time() - t0) * 1000)

    label = result["label"]
    probs = result["probabilities"]
    response = {
        "predictedKl": result["predicted_kl"],
        "label": label,
        "meaning": KL_MEANING.get(label, ""),
        "confidence": round(float(result["confidence"]), 4),
        "probabilities": {k: round(float(v), 6) for k, v in probs.items()},
        "sourceFormat": fmt,
        "inferenceMs": elapsed_ms,
        # Non-diagnostic screening output. The clinical decision stays
        # with the radiologist/physician.
        "disclaimer": (
            "AI-assisted screening estimate, not a medical diagnosis. "
            "Review with a qualified healthcare professional."
        ),
    }

    # Optional Grad-CAM overlay. Deliberately non-fatal: an explainability
    # failure must never cost the caller the diagnostic prediction above.
    if GRADCAM_ENABLED:
        try:
            response["gradcam"] = _gradcam_overlay(array, model)
        except Exception as exc:  # noqa: BLE001
            import traceback
            print(f"[medha-ml] gradcam failed (prediction still returned): {exc!r}",
                  flush=True)
            traceback.print_exc()
            response["gradcam"] = None
            response["gradcam_error"] = repr(exc)
    return jsonify(response)


def _gradcam_overlay(array, model):
    """Render the Grad-CAM attention overlay as a base64 PNG.

    This is an explainability aid for the base EfficientNet-B0 prediction. It
    does NOT participate in the authoritative 30/70 original/flip TTA result
    returned by /predict, and it must never be described as disease
    localisation or as proof of OA.
    """
    import gradcam  # type: ignore
    from inference import preprocess_image  # type: ignore

    # Reuse the real pipeline's preprocessing so the overlay is computed from
    # exactly the tensor the authoritative prediction saw (1, 224, 224, 3).
    batch = preprocess_image(array)
    heatmap, predicted_class, _probs = gradcam.make_gradcam_heatmap(model, batch)

    # render_gradcam_png() takes anything Image.open() accepts, so the
    # preprocessed frame is handed over in memory rather than via a temp file:
    # on Windows an open NamedTemporaryFile cannot be reopened by name, and a
    # 224x224 frame is small enough that the disk round-trip buys nothing.
    # It must be the preprocessed frame, not the original upload, or the overlay
    # would not line up with the base image.
    frame = Image.fromarray(np.uint8(batch[0].numpy())).convert("RGB")
    frame_buf = io.BytesIO()
    frame.save(frame_buf, format="PNG")
    frame_buf.seek(0)
    png = gradcam.render_gradcam_png(frame_buf, heatmap, alpha=0.40)

    return {
        "imageBase64": base64.b64encode(png).decode("utf-8"),
        "caption": "Model Attention Visualization (Grad-CAM)",
        "note": (
            "Highlights image regions that contributed to the model's prediction. "
            "It is an explainability aid, not a definitive indication of disease location."
        ),
        # Base-model class the map was computed for. May differ from the TTA
        # result in predictedKl, which is why the UI labels it separately.
        "baseClass": (gradcam.CLASS_NAMES[predicted_class]
                      if 0 <= predicted_class < len(gradcam.CLASS_NAMES) else None),
    }


# --------------------------------------------------------------------------
# Live sensor routes
# --------------------------------------------------------------------------
@app.get("/api/imu/status")
def imu_status():
    """Live gateway state: which IMUs are bound/online and the frame buffer."""
    gw = sensor_gateway.status()
    counts = imu_balance.INGEST.counts()
    ready = sum(1 for v in counts.values() if v >= IMU_TRIAL_MIN_FRAMES) > 0
    return jsonify(
        {
            "gateway": gw,
            "buffered": counts,
            "minFrames": IMU_TRIAL_MIN_FRAMES,
            "ready": ready,
            "trialDurationS": imu_balance.DEFAULT_DURATION_S,
            "udpPorts": {k: v[1] for k, v in sensor_gateway.SENSOR_MAP.items()},
            "lanAddress": _lan_hint(),
            # A machine can own several private addresses on different
            # subnets; the sensors may only be able to reach one of them, so
            # the UI offers the whole list instead of guessing silently.
            "lanAddresses": _lan_hints(),
            "firmwareTarget": (
                f"Point the ESP8266 nodes (or the Radxa relay) at UDP "
                f"{sensor_gateway.THIGH_PORT}/{sensor_gateway.SHANK_PORT} on "
                f"{_lan_hint() or '<this PC>'}"
                + (
                    f"; other local addresses: "
                    f"{', '.join(_lan_hints()[1:])}"
                    if len(_lan_hints()) > 1
                    else ""
                )
            ),
            "gatewayStarted": _gateway_started,
            "gatewayError": _gateway_error,
        }
    )


@app.post("/api/imu/trial")
def imu_trial():
    """Score the rolling live window with the simulated-mode pipeline."""
    body = request.get_json(silent=True) or {}
    require_all = bool(body.get("requireAll", IMU_TRIAL_REQUIRE_ALL))
    min_frames = int(body.get("minFrames", IMU_TRIAL_MIN_FRAMES))

    trial = imu_balance.INGEST.recent_trial(
        min_frames=min_frames, require_all=require_all
    )
    if trial is None:
        counts = imu_balance.INGEST.counts()
        return jsonify(
            {
                "error": "NOT_ENOUGH_DATA",
                "message": (
                    f"Need at least {min_frames} frames from "
                    f"{'both IMUs' if require_all else 'at least one IMU'}. "
                    f"Buffered: thigh {counts['sensor1']}, shank {counts['sensor2']}. "
                    "Check the nodes are powered and streaming."
                ),
                "buffered": counts,
            }
        ), 409

    result = imu_balance.score_trial(trial)
    # Mean across whichever IMUs contributed, so the saved record matches the
    # composite score the report renders.
    present = [result["sensors"][k] for k in result["sensorsPresent"] if result["sensors"].get(k)]
    n = max(1, len(present))
    result["mean"] = {
        "vibration_rms": round(sum(m["vibration_rms"] for m in present) / n, 3),
        "jerk_rms": round(sum(m["jerk_rms"] for m in present) / n, 2),
        "sway_rms": round(sum(m["sway_rms"] for m in present) / n, 2),
    }
    result["reference"] = imu_balance.REFERENCE
    result["series"] = imu_balance.series_for_chart(trial)
    result["disclaimer"] = (
        "Wearable IMU screening estimate, not a medical diagnosis. "
        "Review with a qualified healthcare professional."
    )
    return jsonify(result)


@app.get("/api/grip/status")
def grip_status():
    """Load-cell state. Honest about absence so the UI can fall back to manual."""
    gw = sensor_gateway.status()
    g = gw.get("gripper", {})
    simulated = bool(g.get("simulated"))
    age = (time.time() - _latest_grip["t"]) if _latest_grip["t"] else None
    return jsonify(
        {
            # `available` drives whether the UI shows a live reading. A simulated
            # trace is offered so the flow can be exercised, and `simulated` is
            # always sent alongside it so the UI can label it as demo data.
            "available": bool(g.get("online")) or simulated,
            "simulated": simulated,
            # Suppressed for the stand-in trace: the panel should read like a
            # normal live sensor. Provenance still rides in `simulated` for the
            # saved record.
            "note": "" if simulated else g.get("note", ""),
            "hardwareEnabled": bool(sensor_gateway.HX711_ENABLED),
            "kg": (g.get("filtered_kg", 0.0) if g.get("online")
                   else (g.get("simulated_kg") if simulated else None)),
            "raw": g.get("raw") if g.get("online") else None,
            "peakKg": sensor_gateway.GRIP_SIM_PEAK_KG if simulated else None,
            "ageS": round(age, 1) if age is not None else None,
            "gatewayRunning": _gateway_started,
        }
    )


@app.errorhandler(413)
def too_large(_err):
    return jsonify({"error": "Image is too large (limit 20 MB)."}), 413


@app.errorhandler(404)
def not_found(_err):
    return jsonify({"error": "Unknown endpoint."}), 404


@app.errorhandler(500)
def server_error(err):
    return jsonify({"error": f"Internal error: {err}"}), 500


if __name__ == "__main__":
    print(f"[medha-ml] deploy root : {DEPLOY_ROOT}", flush=True)
    print(f"[medha-ml] model      : {MODEL_PATH}", flush=True)
    print(f"[medha-ml] inference  : {INFERENCE_DIR}", flush=True)
    print(f"[medha-ml] gradcam    : {'on' if GRADCAM_ENABLED else 'off'}", flush=True)
    print(f"[medha-ml] listening  : http://{HOST}:{PORT}", flush=True)
    _start_sensor_gateway()
    if _gateway_started:
        hints = _lan_hints()
        print(f"[medha-ml] IMU nodes should target this PC: "
              f"{hints[0] if hints else '?'} "
              f"(UDP {sensor_gateway.THIGH_PORT}/{sensor_gateway.SHANK_PORT})", flush=True)
        if len(hints) > 1:
            print(f"[medha-ml] other local addresses, in case that one is on a "
                  f"subnet the sensors cannot route to: {', '.join(hints[1:])}",
                  flush=True)
            print(f"[medha-ml] pin the right one with MEDHA_LAN_IP", flush=True)
    warm_up()
    app.run(host=HOST, port=PORT, threaded=True)
