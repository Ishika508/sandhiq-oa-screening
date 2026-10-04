"""MEDHA — IMU balance & vibration layer (single-leg quiet-stance hold).

Two IMUs are worn on ONE leg (e.g. one on the thigh, one on the shank). Each
IMU is a 3-axis device reporting raw accelerometer (ax, ay, az in m/s² —
ay carries the ~9.8 m/s² gravity offset) and gyroscope (gx, gy, gz in °/s)
frames at the sampling rate. The person holds a quiet stance while the
sensors record micro-vibration and sway. The captured signals are compared
against healthy-reference bands and turned into a vibration/instability risk
flag, which becomes the 4th module of the combined OA screening report.

Per-axis analysis
-----------------
For every sensor the x/y/z accelerometer (and gyro) channels are decomposed
separately: after de-trending (removing the constant gravity bias and slow
body drift) each axis is band-passed and its RMS is reported, so the report
shows vibration along each axis as well as the overall magnitude
sqrt(x² + y² + z²). Scoring for the risk flag always uses the magnitude and
its derived jerk/sway so a single clear number feeds the report.

Data paths
----------
* SIMULATED: with the sensor hardware not yet wired in, the server generates a
  deterministic synthetic trial so the screening flow and report can be
  exercised end-to-end. Every simulated result is explicitly labelled
  "SIMULATED" wherever it appears.
* LIVE: when the ESP8266 nodes stream UDP frames into the gateway, the same
  scoring function (`score_trial`) is used unchanged — it never switches on
  source. Frames are buffered by `IngestBuffer`, which ml/server.py feeds from
  the gateway's on_imu callback.

The bands below are PRELIMINARY prototype cutoffs and must be recalibrated
against real sensor recordings once hardware data is available.
"""

import math
import random
import statistics
import threading
import time

RATE_HZ = 100.0            # simulated sampling rate (samples per second)
DEFAULT_DURATION_S = 8.0   # quiet-stance hold length (8-second demo / capture)
TREMOR_LOW, TREMOR_HIGH = 1.5, 7.0   # dominant tremor band in Hz

# Healthy-reference bands (per metric). Values at/below `low` are normal,
# values at/above `high` are a high-risk flag, in between is a moderate band.
# Bands are set for REAL quiet-stance physiology: a steady healthy person
# (vibration ~0.1-0.3 m/s², gyro sway ~1-5 °/s) must stay inside `low`.
REFERENCE = {
    "vibration_rms": {"low": 0.30, "high": 0.90, "unit": "m/s\u00b2",
                      "label": "Vibration amplitude",
                      "meaning": "RMS body micro-vibration magnitude over the x/y/z accelerometer axes"},
    "jerk_rms": {"low": 6.0, "high": 20.0, "unit": "m/s\u00b3",
                 "label": "Micro-motion (jerk)",
                 "meaning": "rate of acceleration change; erratic tremor energy"},
    "sway_rms": {"low": 5.0, "high": 15.0, "unit": "\u00b0/s",
                 "label": "Rotational sway",
                 "meaning": "RMS gyroscope drift — postural instability"},
    "tremor_freq": {"low": TREMOR_LOW, "high": TREMOR_HIGH, "unit": "Hz",
                    "label": "Dominant tremor band",
                    "meaning": "main oscillation frequency of the leg"},
}

# Risk weights (lower-frequency tremor is physiologic, so frequency itself is
# informational only and does not contribute to the risk score).
RISK_WEIGHTS = {"vibration_rms": 0.45, "jerk_rms": 0.30, "sway_rms": 0.25}

# Scenario amplitudes for the explicit simulation mode. These are tuned so the
# generated trials land clearly inside the intended band with realistic values.
SCENARIOS = {
    "low":      {"vib": 0.220, "jerk_bias": 0.0, "sway": 6.0, "freq": 3.2, "noise": 0.015},
    "moderate": {"vib": 0.550, "jerk_bias": 0.0, "sway": 16.0, "freq": 4.1, "noise": 0.045},
    "high":     {"vib": 1.050, "jerk_bias": 0.0, "sway": 36.0, "freq": 5.0, "noise": 0.080},
}

SENSOR_LABELS = {"sensor1": "Thigh IMU", "sensor2": "Shank IMU"}
SENSOR_PLACEMENT = {
    "sensor1": "sensor attached to the thigh (upper leg)",
    "sensor2": "sensor attached to the shank (lower leg)",
}

BAND_WORD = {"low": "Low", "moderate": "Moderate", "high": "High"}


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

def _phase_rng(seed):
    """Deterministic small PRNG so the same seed reproduces the same trial."""
    state = (seed * 2654435761 + 2246822519) & 0xFFFFFFFF
    return random.Random(state)


def simulate_trial(intensity="moderate", duration_s=DEFAULT_DURATION_S, seed=None):
    """Generate a deterministic synthetic quiet-stance trial.

    Returns {seed, duration_s, sensors: {sensor1/sensor2: [sample, ...]}}
    where each sample is {"t", "a": [ax, ay, az], "g": [gx, gy, gz]}.
    ay is the vertical axis and carries the ~9.8 m/s² gravity offset so the
    scoring path resembles real raw IMU frames.
    """
    if seed is None:
        seed = random.randrange(1, 2 ** 31)
    intensity = intensity if intensity in SCENARIOS else "moderate"
    p = SCENARIOS[intensity]
    rate = RATE_HZ
    n = max(10, int(round(duration_s * rate)))

    sensors = {}
    for idx, key in enumerate(("sensor1", "sensor2"), start=1):
        rng = _phase_rng(seed + idx * 97)
        amp = p["vib"] * math.sqrt(2.0)          # sine amplitude -> target RMS
        freq = p["freq"] * (1.0 + 0.06 * (rng.random() - 0.5))
        fslow = 0.55 + 0.15 * (rng.random() - 0.5)   # slow postural sway (Hz)
        sway_amp = p["sway"] * math.sqrt(2.0)
        phi1 = rng.random() * math.tau
        phi2 = rng.random() * math.tau
        phi3 = rng.random() * math.tau
        # slight asymmetric coupling between the two leg sensors
        gain = 1.0 if idx == 1 else 0.88 + 0.10 * rng.random()
        samples = []
        for i in range(n):
            t = i / rate
            trem = amp * gain * math.sin(math.tau * freq * t + phi1) \
                + 0.28 * amp * gain * math.sin(math.tau * freq * 2.2 * t + phi2)
            sway = sway_amp * gain * math.sin(math.tau * fslow * t + phi3)
            n1 = rng.gauss(0, p["noise"])
            n2 = rng.gauss(0, p["noise"] * 0.6)
            n3 = rng.gauss(0, p["noise"] * 0.8)
            # gyros report angular rate; gravity acts along +y (vertical)
            samples.append({
                "t": round(t, 4),
                "a": [round(0.05 * gain * math.sin(math.tau * fslow * t + phi2) + n2, 6),
                      round(9.8 + trem + n1, 6),
                      round(0.04 * gain * math.sin(math.tau * fslow * t * 1.3 + phi3) + n3, 6)],
                "g": [round(0.5 * gain * math.sin(math.tau * fslow * t + phi1) + n3, 5),
                      round(sway + 0.6 * trem * 20.0 * 0.08, 5),
                      round(0.4 * gain * math.sin(math.tau * fslow * t + phi2) + n2, 5)],
            })
        sensors[key] = samples
    return {"source": "simulated", "intensity": intensity,
            "seed": seed, "duration_s": duration_s, "sensors": sensors}


# ---------------------------------------------------------------------------
# Signal processing (identical for simulated and live data)
# ---------------------------------------------------------------------------

def _detrend(values):
    m = statistics.fmean(values) if values else 0.0
    return [v - m for v in values]


def _sample_rate(samples, fallback=RATE_HZ):
    """True sampling rate (Hz) from the frame timestamps, else the default.

    Live frames carry arrival wall-clock seconds in their "t" field, so the
    DSP pipeline uses the real rate instead of assuming the simulated 100 Hz.
    """
    n = len(samples)
    if n >= 2:
        t0 = samples[0].get("t")
        t1 = samples[-1].get("t")
        if isinstance(t0, (int, float)) and isinstance(t1, (int, float)) and t1 > t0:
            return max(1.0, (n - 1) / (t1 - t0))
    return fallback


def _rms(values):
    if not values:
        return 0.0
    return math.sqrt(statistics.fmean(v * v for v in values))


def _bandpass(values, fs, win_s=1.0):
    """Crude high-pass: remove a `win_s` moving-mean so slow sway/trends
    (and any residual gravity bias) stay out of the tremor estimate."""
    win = max(2, int(round(fs * win_s)))
    out = []
    for i, v in enumerate(values):
        lo = max(0, i - win)
        hi = min(len(values), i + win + 1)
        out.append(v - statistics.fmean(values[lo:hi]))
    return out


def _dominant_freq(signal, fs):
    """Zero-crossing estimate of the dominant oscillation frequency (Hz)."""
    zc = 0
    n = len(signal)
    if n < 2:
        return 0.0
    for i in range(1, n):
        if signal[i - 1] < 0 <= signal[i]:
            zc += 1
    freq = zc / (2 * (n - 1) / fs)
    return max(0.0, min(12.0, freq))


def _accel_magnitude(samples):
    return [math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) for a in (s["a"] for s in samples)]


def _gyro_magnitude(samples):
    return [math.sqrt(g[0] ** 2 + g[1] ** 2 + g[2] ** 2) for g in (s["g"] for s in samples)]


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _normalized(value, low, high):
    """0 at/below normal threshold, 1 at/above high-risk threshold."""
    if value <= low:
        return 0.0
    if value >= high:
        return 1.0
    return (value - low) / (high - low) if high > low else 0.0


def _band_for_risk(risk_100):
    if risk_100 >= 70:
        return "high"
    if risk_100 >= 30:
        return "moderate"
    return "low"


def _axis_signals(samples, rate):
    """Gravity-removed, band-passed acceleration on each axis.

    Order matters. De-trending first strips the ~9.8 m/s^2 gravity offset and
    slow sway, leaving the vibration component on every axis.
    """
    axes = {"x": 0, "y": 1, "z": 2}
    return {
        name: _bandpass(_detrend([s["a"][i] for s in samples]), rate)
        for name, i in axes.items()
    }


def _per_axis_vibration(axis_bp):
    """Per-axis band-passed RMS, for the UI's per-axis breakdown."""
    return {name: round(_rms(sig), 3) for name, sig in axis_bp.items()}


def _vib_magnitude(axis_bp):
    """Rebuild the vibration magnitude AFTER gravity removal.

    This must not be computed as de_trend(|acc|). Taking the magnitude first
    buries the signal in the gravity offset: a 0.5 m/s^2 tremor only modulates
    the total magnitude by ~0.6%, and a circular/elliptical shake (direction
    rotating at constant speed - the normal shape of a tremor) leaves |acc|
    mathematically constant, so the whole motion vanished and the trial scored
    0 m/s^2 / "low risk".
    """
    n = len(next(iter(axis_bp.values()))) if axis_bp else 0
    return [math.sqrt(sum(axis_bp[k][i] ** 2 for k in axis_bp)) for i in range(n)]


def score_trial(trial):
    """Score a trial dict (from simulate_trial or from live ingestion).

    Returns the full structured result consumed by the UI and stored in the
    screening record / report.
    """
    sensors = trial.get("sensors") or {}
    duration_s = float(trial.get("duration_s") or DEFAULT_DURATION_S)
    per_sensor = {}

    for key in ("sensor1", "sensor2"):
        samples = sensors.get(key) or []
        if len(samples) < 10:
            per_sensor[key] = None
            continue
        rate = _sample_rate(samples)
        axis_bp = _axis_signals(samples, rate)
        vib_mag = _vib_magnitude(axis_bp)
        n = len(vib_mag)

        vibration_rms = _rms(vib_mag)

        # Jerk is the rate of change of the acceleration *vector*, so it is
        # summed per axis and then combined. Differentiating the rectified
        # magnitude instead would fold the rectification offset into the RMS
        # and inflate it.
        dt = 1.0 / rate
        jerk_sq = [sum(((axis_bp[k][i] - axis_bp[k][i - 1]) / dt) ** 2 for k in axis_bp)
                   for i in range(1, n)]
        jerk_rms = math.sqrt(sum(jerk_sq) / len(jerk_sq)) if jerk_sq else 0.0

        sway_rms = _rms(_detrend(_gyro_magnitude(samples)))
        tremor_freq = _dominant_freq(vib_mag, rate)

        per_sensor[key] = {
            "vibration_rms": round(vibration_rms, 3),
            "jerk_rms": round(jerk_rms, 2),
            "sway_rms": round(sway_rms, 2),
            "tremor_freq": round(tremor_freq, 2),
            "vibration_axis": _per_axis_vibration(axis_bp),
        }

    metrics = {}
    weights = []
    values = []
    for key, m in per_sensor.items():
        if m is None:
            continue
        metrics[key] = m
        weights.append(RISK_WEIGHTS["vibration_rms"])
        values.append(_normalized(m["vibration_rms"],
                                  REFERENCE["vibration_rms"]["low"],
                                  REFERENCE["vibration_rms"]["high"]))
        weights.append(RISK_WEIGHTS["jerk_rms"])
        values.append(_normalized(m["jerk_rms"], REFERENCE["jerk_rms"]["low"],
                                  REFERENCE["jerk_rms"]["high"]))
        weights.append(RISK_WEIGHTS["sway_rms"])
        values.append(_normalized(m["sway_rms"], REFERENCE["sway_rms"]["low"],
                                  REFERENCE["sway_rms"]["high"]))

    weighted = 0.0
    if values:
        tot = sum(weights)
        weighted = sum(w * v for w, v in zip(weights, values)) / tot
    risk_100 = int(round(100.0 * (0.02 + 0.98 * max(0.0, min(1.0, weighted)))))
    risk_100 = max(1, min(99, risk_100))
    band = _band_for_risk(risk_100)

    return {
        "source": trial.get("source", "live"),
        "intensity": trial.get("intensity"),
        "seed": trial.get("seed"),
        "duration_s": round(duration_s, 1),
        "band": band,
        "risk_100": risk_100,
        # Which IMUs actually contributed. A one-sensor trial must be disclosed
        # as such rather than presented as the intended two-node measurement.
        "sensorsPresent": [k for k in ("sensor1", "sensor2") if per_sensor.get(k)],
        "sensors": per_sensor,
        "explanation": _explain(per_sensor, band, risk_100, trial.get("source"), duration_s),
    }


def _explain(per_sensor, band, risk_100, source, duration_s):
    lines = []
    present = [k for k in ("sensor1", "sensor2") if per_sensor.get(k)]
    if len(present) == 2:
        lines.append(
            f"During a {duration_s:.0f}-second quiet-stance hold, both leg IMUs "
            f"(3-axis x/y/z accelerometer + gyroscope) showed an overall "
            f"vibration/instability level rated {BAND_WORD[band].lower()}."
        )
    elif present:
        lines.append(
            f"During a {duration_s:.0f}-second quiet-stance hold, the available "
            f"leg IMU (3-axis x/y/z accelerometer + gyroscope) showed an "
            f"overall vibration/instability level rated "
            f"{BAND_WORD[band].lower()}."
        )
    else:
        return ["The IMU balance trial could not be scored — no sensor samples were captured."]
    lines.append(
        f"In a healthy reference stance the vibration amplitude is expected "
        f"below {REFERENCE['vibration_rms']['high']:.2f} {REFERENCE['vibration_rms']['unit']}, "
        f"jerk below {REFERENCE['jerk_rms']['high']:.1f} {REFERENCE['jerk_rms']['unit']} and "
        f"sway below {REFERENCE['sway_rms']['high']:.1f} {REFERENCE['sway_rms']['unit']}."
    )
    lines.append(
        f"This trial scores {risk_100}/100 on the vibration-instability scale, "
        f"a {BAND_WORD[band].lower()}-risk flag."
    )
    if source == "simulated":
        lines.append(
            "SIMULATED trial: the sensors were not connected during this run, "
            "so the record uses generated data to test the screening flow. The "
            "result will be re-generated from live sensor data once the IMUs "
            "are wired."
        )
    return lines


# ---------------------------------------------------------------------------
# Series for the on-screen chart (downsampled detrended vibration signal)
# ---------------------------------------------------------------------------

def series_for_chart(trial, max_points=240, sensor_limit=2):
    """Waveform for the UI, built from the same gravity-removed magnitude the
    score uses - otherwise a real circular tremor scores non-zero while its
    trace looks dead, and the two contradict each other on screen."""
    out = {}
    sensors = trial.get("sensors") or {}
    for key, samples in list(sensors.items())[:sensor_limit]:
        if len(samples) < 10:
            continue
        vib = _vib_magnitude(_axis_signals(samples, _sample_rate(samples)))
        step = max(1, len(vib) // max_points)
        out[key] = [round(v, 4) for v in vib[::step]][:max_points]
    return out


# ---------------------------------------------------------------------------
# Live ingestion buffer (fed by sensor_gateway's on_imu callback)
# ---------------------------------------------------------------------------

class IngestBuffer:
    """Thread-safe windowed buffer for live IMU sample streams.

    Each IMU is a 3-axis device. sensor_gateway decodes the ESP8266 UDP frames
    and calls on_imu(sensor_key, frame); ml/server.py forwards each frame here
    with `push`. The rolling window is then assembled into a trial that
    score_trial scores with the identical pipeline used for simulated data.

    Frames must carry `t` as ARRIVAL wall-clock seconds (the gateway sets it on
    decode), because the window is trimmed against time.time(). The DSP then
    derives the true sampling rate from those timestamps, so it does not assume
    the simulated 100 Hz.
    """

    def __init__(self, window_s=DEFAULT_DURATION_S + 2.0):
        self._window_s = window_s
        self._chunks = {"sensor1": [], "sensor2": []}
        self._lock = threading.Lock()

    def push(self, sensor, sample):
        if sensor not in self._chunks:
            return
        with self._lock:
            self._chunks[sensor].append(sample)
            cutoff = time.time() - self._window_s
            self._chunks[sensor] = [s for s in self._chunks[sensor] if s.get("t", 0) >= cutoff]

    def counts(self):
        """Buffered frame count per sensor, for the UI's readiness check."""
        cutoff = time.time() - self._window_s
        with self._lock:
            return {k: len([s for s in v if s.get("t", 0) >= cutoff])
                    for k, v in self._chunks.items()}

    def recent_trial(self, min_frames=10, require_all=True):
        """Assemble the rolling window into a trial, or None.

        `require_all=True` demands a usable window from BOTH leg IMUs, which is
        the intended capture protocol (thigh + shank on the same leg). Setting
        it False allows a single-sensor trial so a partially-fitted setup still
        yields data — score_trial and its explanation both handle one sensor,
        and the result is reported as a single-sensor trial rather than being
        presented as a two-node measurement.
        """
        counts = self.counts()
        usable = [k for k in ("sensor1", "sensor2") if counts[k] >= min_frames]
        if not usable:
            return None
        if require_all and len(usable) < 2:
            return None

        trial = {"source": "live", "duration_s": DEFAULT_DURATION_S, "sensors": {}}
        cutoff = time.time() - self._window_s
        with self._lock:
            for key in usable:
                frames = [s for s in self._chunks[key] if s.get("t", 0) >= cutoff]
                frames.sort(key=lambda s: s.get("t", 0))
                trial["sensors"][key] = frames

        spans = [max(1.0, trial["sensors"][k][-1]["t"] - trial["sensors"][k][0]["t"])
                 for k in usable]
        trial["duration_s"] = max(spans)
        trial["sensorsPresent"] = list(usable)
        return trial

    def reset(self):
        with self._lock:
            self._chunks = {"sensor1": [], "sensor2": []}


INGEST = IngestBuffer()