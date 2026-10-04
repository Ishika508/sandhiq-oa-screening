# ML_GUIDE.md — Plugging in your trained models and hardware

This file is the map for everything left as a documented placeholder in the app. Every stub below
is written so you can find and replace it with a single, obvious edit — no architecture changes.

---

## 1. X-ray KL-grade model — DONE (real model, no mock)

**Status:** integrated. The `mockInfer` stub has been removed.

The deployed model is an EfficientNet-B0 Phase 2A Keras classifier
(`MEDHA_OA_DEPLOY/model/medha_oa_kl_final.keras`, 224x224x3, classes KL0–KL4) with
horizontal-flip test-time augmentation (0.30 original + 0.70 flipped). Held-out
accuracy is **60.57%** on 1,656 radiographs.

TensorFlow cannot run inside Next.js, so the model lives in a local Python service
(this is the "Option B" route below) and the browser only ever talks to the Next origin.
The service binds `127.0.0.1`, so X-rays never leave the machine over the network.

### Layout

| Piece | Path | Role |
| --- | --- | --- |
| Inference service | `ml/server.py` | Loads the model once, serves `/predict`, `/health`, `/metadata` |
| Next proxy | `app/api/xray/route.js` | Validates the upload, forwards, maps errors to status codes |
| UI | `components/steps/XrayStep.js` | Upload, run analysis, show grade + per-class probabilities |
| Reference impl | `MEDHA_OA_DEPLOY/inference/inference.py` | Imported, **not** re-implemented, so preprocessing/TTA match the validated numbers |

### Running it

```bash
# one-time: create the env (TensorFlow needs Python 3.9-3.13; 3.11 is used here)
C:\Users\HP\AppData\Local\Programs\Python\Python311\python.exe -m venv C:\Users\HP\Downloads\MEDHA_OA_DEPLOY\.venv
C:\Users\HP\Downloads\MEDHA_OA_DEPLOY\.venv\Scripts\python.exe -m pip install "tensorflow-cpu>=2.20,<2.21" "numpy>=1.26,<3" "Pillow>=10" "Flask>=3"

# start the model service and leave it running
npm run ml:serve
npm run ml:health

# then the app
npm run dev
```

`.env.local` controls it via `MEDHA_ML_URL` (default `http://127.0.0.1:8000`) and
`MEDHA_ML_TIMEOUT_MS` (default 120000). `MEDHA_DEPLOY_ROOT` / `MEDHA_MODEL_PATH` relocate
the model package. Inferred grades are persisted as `steps.xray.klGrade` (0–4 integer) so
`structuralSeverity()` in `lib/fusion.js` keeps working unchanged.

### If the service is not running

The step degrades cleanly: the uploaded image stays, `Save` stays disabled, and the UI
shows the exact command to start the service. `GET /api/xray` returns `503 MODEL_UNAVAILABLE`.

### Why the service reuses the package's `inference.py`

60.57% accuracy is only meaningful if the serving path matches the one that was measured.
Rather than re-deriving the preprocessing, `server.py` imports `preprocess_image` and
`predict_xray` straight from the deploy package, so the resize, dtype handling, and the
0.30/0.70 flip weighting cannot silently drift from the validated pipeline.

### Honest limits — do not hide these

KL1 recall is **7.4%**: the model almost never reports early-stage disease, and genuine KL1
films are usually labelled KL0 (KL0 recall is 90.3%). Per-class held-out results:

| Grade | Recall | Precision | Support |
| --- | --- | --- | --- |
| KL0 | 90.3% | 62.2% | 639 |
| KL1 | 7.4% | 26.2% | 296 |
| KL2 | 57.5% | 57.0% | 447 |
| KL3 | 50.2% | 77.2% | 223 |
| KL4 | 68.6% | 72.9% | 51 |

`XrayStep` flags low-confidence (<55%) and ambiguous (top-2 within 15%) results, and a
"How reliable is this model?" disclosure renders the table above from `/metadata`. The output
is screening support for a clinician, never a diagnosis.

### If you later retrain

Drop in a new `.keras` file and, if the architecture or TTA changes, update
`MEDHA_OA_DEPLOY/inference/inference.py` too — the service calls it, so the UI needs no edits.
The images in `MEDHA_OA_DEPLOY/explainability/gradcam/` are fixed examples, not Grad-CAM
output for a newly uploaded radiograph.

### Option A (alternative, not used) — run inference client-side in TFJS

To drop the Python service, convert the model and call it from the browser instead:

```bash
pip install tensorflowjs
tensorflowjs_converter --input_format=keras medha_oa_kl_final.keras ./public/models/xray-kl
```

This removes the Python dependency but pushes ~37 MB of weights to the client, duplicates the
TTA logic in JavaScript, and drifts from the validated `inference.py`. The service approach
above is what the app ships with.

---

## 2. Grip strength sensor (HX711 load cell via Radxa/ESP32)

**File:** `components/steps/GripStep.js`
**Function:** `tryConnectSensor()`

Currently just waits 4 seconds and times out (no hardware wired). The original MEDHA hardware
design pushes filtered grip readings from the Radxa to a laptop endpoint. Two ways to receive
that here:

### Simplest: local polling endpoint
1. Have your Radxa's `sensor_gateway.py` POST grip readings to a small local server (or directly
   to a Next.js API route if the app runs on the same machine reachable from the Radxa):
   ```js
   // app/api/grip-ingest/route.js
   let latestGrip = null;
   export async function POST(req) {
     const { kg, timestamp } = await req.json();
     latestGrip = { kg, timestamp };
     return Response.json({ ok: true });
   }
   export async function GET() {
     return Response.json(latestGrip);
   }
   ```
2. In `GripStep.js`, replace the `setTimeout` with a `fetch("/api/grip-ingest")` poll every ~500ms
   until a fresh reading (within ~15s, matching the original MEDHA freshness guard) arrives.

### Alternative: WebSocket push
If you'd rather push instead of poll, stand up a WebSocket server on the Radxa/gateway and
connect to it from `GripStep.js` with the native `WebSocket` API — same idea, lower latency.

**Expected payload shape** (matches the original MEDHA hardware doc's HX711 pipeline):
```json
{ "kg": 23.4, "source": "sensor", "timestamp": 1735000000000 }
```

---

## 3. IMU sensors (bilateral thigh + shank, ESP32/ESP8266 via Radxa relay)

**File:** `components/steps/ImuStep.js`
**Function:** `tryConnectLive()`

Same pattern as grip: currently a 4-second timeout placeholder. The original MEDHA architecture
relays raw IMU UDP packets (ports 5005/5006) from ESP32/ESP8266 → Radxa → your compute device.
Browsers can't read raw UDP directly, so bridge it:

1. On your gateway (Radxa or laptop), run a small process that listens on UDP 5005/5006,
   decodes the IMU frames, computes the DSP features (vibration amplitude, jerk, sway — or the
   vibroarthrography frequency features per the project's design doc), and exposes the *result*
   over HTTP or WebSocket.
2. In `ImuStep.js`, replace the timeout with a `fetch`/`WebSocket` call to that endpoint.

**Expected result shape** the UI already knows how to consume:
```json
{ "vibrationAmp": 0.14, "jerk": 2.8, "sway": 4.2, "riskScore": 55 }
```

This is exactly the shape produced by the "Simulated" mode in `ImuStep.js` — use
`SIM_PRESETS` in that file as your reference for what a live payload should look like.

---

## 4. Radxa camera stream

**File:** `components/steps/CvStep.js`

The Radxa camera mode already works end-to-end against **any MJPEG or WebRTC stream URL** you
enter in the UI — the same TensorFlow.js pose pipeline (`lib/pose/poseEngine.js`) runs on it
identically to the laptop webcam. What's still yours to build is the **Radxa-side script that
serves that stream**. The simplest option:

```python
# on the Radxa, using OpenCV + a tiny Flask MJPEG server
from flask import Flask, Response
import cv2

app = Flask(__name__)
cam = cv2.VideoCapture(0)

def gen_frames():
    while True:
        ok, frame = cam.read()
        if not ok: continue
        _, buffer = cv2.imencode('.jpg', frame)
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

@app.route('/stream')
def stream():
    return Response(gen_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

app.run(host='0.0.0.0', port=8080)
```

Then in the app's CV step, choose "Radxa Camera" and enter `http://<radxa-ip>:8080/stream`.

---

## 5. Improving the pose-based scoring itself

**File:** `lib/pose/poseEngine.js`

The scoring in this file is **no longer a placeholder** — it is a faithful port of the original
MEDHA engine (`static/js/sppb.js` + `static/js/vision_app.js` in the legacy project), re-targeted
from MediaPipe landmarks onto TensorFlow.js MoveNet keypoints. The SPPB cut points, the
validity gates and the 0-100 risk composite are byte-for-byte equivalent to the original and
are verified against it by differential sweep, so results are comparable across the rewrite.

Two calibration steps are what make the numbers real, and **both are load-bearing** — removing
either one silently breaks every score:

- **Gait** is metric because the walkway length is fixed and known: `speed = 4.0 m / elapsed`
  is genuinely m/s, which is what the official SPPB cutoffs (8.70 / 6.21 / 4.83 s) expect.
  An earlier version measured `Δx / Δt` in normalised image units and banded that, which
  scored every healthy patient 1/4.
- **Balance** is metric because pixel sway is converted to centimetres using the subject's
  shoulder width against a 38.0 cm adult biacromial reference. The bands (2.0 / 3.0 / 4.5 /
  6.0 cm) are set to the sensor's noise floor so a steady stance scores 4, not 0. An earlier
  version scored raw normalised RMS against `<= 2` bands, which returned a perfect 4/4 for
  everyone including someone swaying 30 cm.

What is still worth revisiting, in rough priority order:

1. **Chair-stand rep latency compensation.** The cut points are the official SPPB stopwatch
   thresholds (16.70 / 13.70 / 11.20 s) shifted by a constant **+2.5 s** to account for this
   pipeline's movement-detection latency. That constant was tuned against the MediaPipe
   pipeline; MoveNet's latency profile differs, so re-measure it and update
   `chairSub()` in `poseEngine.js` if you see systematic bias.
2. **Gait step detection** is a two-signal heuristic (ankle vertical alternation, falling back
   to hip oscillation) with a 300 ms guard. It over-counts on fast shuffles, which inflates
   cadence and shortens mean step length. Cadence and step length only feed the 0-100 risk
   composite — the official sub-score is time-only — so this is a composite-accuracy issue, not
   a sub-score issue. A peak/valley detector on the ankle signal would be more robust.
3. **Balance** is an explicitly non-standard postural-sway proxy, *not* the SPPB
   step-progression balance item. If you want true SPPB balance you need a different protocol.

None of the above are placeholders — they are honest limitations of a vision-based proxy and
are labelled as such in the results panel.

---

## 6. Fusion weights

**File:** `lib/fusion.js`, constant `WEIGHTS`

These match the percentages worked out in the project's Solution Design Annex. They are
explicitly marked TBV there too — once you have labeled outcome data, this is the one object to
tune (ideally by fitting weights against real outcomes rather than hand-adjusting).

Note that `functionalSeverity()` reads `sppbPct` (SPPB points as a percentage of *valid*
points) in preference to the raw `sppbTotal`, so a partial assessment is not scored as though
the missing tests scored zero. It falls back to the raw total for records saved before that
field existed. TUG severity comes from the shared `tugPoints()` banding rather than a second,
independently-editable copy of the same thresholds.

---

## 7. TUG and Knee ROM (added in v2)

**Files:** `lib/pose/poseEngine.js` (`RomTracker`, `tugPoints`), `components/steps/CvStep.js`

- **TUG** is timed with a plain stopwatch (start on "patient begins to rise", stop on "patient is seated") — this matches how TUG is measured clinically, so no pose heuristics were layered on top. If you later want automatic sit/stand/turn detection from pose, `ChairStandCounter`'s state-machine approach in `poseEngine.js` is the closest existing pattern to extend.
- **Knee ROM** computes the hip-knee-ankle angle every frame (`kneeAngleDegrees`) and tracks the min/max seen during the capture window; `flexionRange = maxAngle - minAngle`. The 130° "healthy" reference used in `lib/fusion.js` to convert ROM into a severity score is a placeholder (TBV) — replace with a proper normative range once you have reference data.
- Both feed into `functionalSeverity()` in `lib/fusion.js` alongside SPPB, so the Functional domain score in the fusion engine now reflects all five CV sub-tests, not just the original three.
