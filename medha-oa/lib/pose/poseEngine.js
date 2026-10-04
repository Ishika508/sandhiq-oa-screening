// lib/pose/poseEngine.js
//
// In-browser pose estimation (TensorFlow.js MoveNet) driving the five
// computer-vision sub-tests, plus the SPPB scoring engine.
//
// Runs on whatever <video> or <img> element you point it at, so the same
// engine drives BOTH camera modes:
//   - "Laptop" mode: video element fed by getUserMedia (local webcam)
//   - "Radxa" mode: img element fed by an MJPEG stream URL served by the
//     Radxa device on the local network
//
// ---------------------------------------------------------------------------
// SCORING LOGIC IS THE SINGLE SOURCE OF TRUTH
// ---------------------------------------------------------------------------
// The SPPB cut points, validity gates and the 0-100 risk composite below are
// a faithful port of the original MEDHA engine (static/js/sppb.js +
// static/js/vision_app.js). Do not "tidy" the numbers — they are calibrated
// against the original MediaPipe pipeline's behaviour and are reproduced
// exactly so results stay comparable across the interface rewrite.
//
//   chairSub  : official SPPB stopwatch cutoffs (16.70/13.70/11.20) shifted by
//               a constant +2.5 s compensation for this pipeline's
//               movement-detection latency  -> 19.20/16.20/13.70
//   gaitSub   : official SPPB 4 m cutoffs, TIME based (8.70/6.21/4.83 s)
//   balanceSub: RMS sway in CENTIMETRES, banded to the sensor noise floor
//               (2.0/3.0/4.5/6.0 cm) so a steady stance scores 4, not 0
//
// Both gait and balance require a real-world scale reference to be metric:
//   - gait    : the walkway length is fixed and known (4.0 m), so
//               speed = 4.0 / elapsed is genuinely m/s.
//   - balance : pixel sway is converted to cm using the subject's biacromial
//               (shoulder) width against a 38.0 cm adult reference.
// Losing either of those conversions is what previously made every healthy
// patient score 1/4 on gait and 4/4 on balance regardless of performance.
//
// Balance is an explicitly non-standard "postural sway screening proxy" — it
// is NOT the SPPB step-progression balance item. Screening use only.

let tf, poseDetection, detector;

export async function loadPoseModel() {
  if (detector) return detector;
  tf = await import("@tensorflow/tfjs");
  await import("@tensorflow/tfjs-backend-webgl");
  poseDetection = await import("@tensorflow-models/pose-detection");
  await tf.setBackend("webgl");
  await tf.ready();
  detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
  });
  return detector;
}

export async function estimatePose(videoOrImageEl) {
  if (!videoOrImageEl) return null;
  if (!detector) await loadPoseModel();
  if (detector.estimatePoses && videoOrImageEl.readyState === 0 && videoOrImageEl.tagName === "VIDEO") {
    return null;
  }
  const poses = await detector.estimatePoses(videoOrImageEl, { flipHorizontal: false });
  return poses?.[0] || null;
}

// ---------------- keypoint / geometry helpers ----------------

const DEFAULT_MIN_SCORE = 0.3;

export function keypointByName(pose, name) {
  return pose?.keypoints?.find((k) => k.name === name) || null;
}

// MoveNet exposes `score`; MediaPipe used `visibility`. Accept both so the
// original threshold semantics survive the backend swap.
export function kpScore(k) {
  if (!k) return 0;
  if (typeof k.score === "number") return k.score;
  if (typeof k.visibility === "number") return k.visibility;
  return 1;
}

// Returns the keypoint only if it is confident enough to measure from.
export function kp(pose, name, minScore = DEFAULT_MIN_SCORE) {
  const k = keypointByName(pose, name);
  if (!k) return null;
  return kpScore(k) >= minScore ? k : null;
}

// Name -> keypoint lookup, built once per frame. Used by the skeleton overlay
// and by the trackers so we never re-scan the keypoint array per joint.
export function keypointMap(pose, minScore = 0) {
  const m = Object.create(null);
  if (pose?.keypoints) {
    for (const k of pose.keypoints) {
      if (k && k.name && kpScore(k) >= minScore) m[k.name] = k;
    }
  }
  return m;
}

// Skeleton topology for the 17-keypoint MoveNet output, by keypoint name.
// Replaces MediaPipe's numeric POSE_CONNECTIONS table so the overlay traces the
// same figure the original engine did: face, trunk, both arms, both legs.
export const SKELETON_CONNECTIONS = [
  ["nose", "left_eye"], ["nose", "right_eye"],
  ["left_eye", "left_ear"], ["right_eye", "right_ear"],
  ["nose", "left_shoulder"], ["nose", "right_shoulder"],
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];

// The landmarks each test actually measures, highlighted in the overlay so the
// operator can see at a glance whether the joints that matter are being tracked.
export const TEST_FOCUS_JOINTS = {
  chairStand: ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"],
  gait: ["left_hip", "right_hip", "left_ankle", "right_ankle", "left_shoulder", "right_shoulder"],
  balance: ["left_hip", "right_hip", "left_shoulder", "right_shoulder"],
  rom: ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"],
};

export function midpoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function hipMidpoint(pose, minScore = DEFAULT_MIN_SCORE) {
  return midpoint(kp(pose, "left_hip", minScore), kp(pose, "right_hip", minScore));
}

export function shoulderMidpoint(pose, minScore = DEFAULT_MIN_SCORE) {
  return midpoint(kp(pose, "left_shoulder", minScore), kp(pose, "right_shoulder", minScore));
}

// Shoulder width in normalised image units — the in-image scale reference.
// Returns 0 when the shoulders are not confidently visible.
export function shoulderWidth(pose, minScore = DEFAULT_MIN_SCORE) {
  const l = kp(pose, "left_shoulder", minScore);
  const r = kp(pose, "right_shoulder", minScore);
  if (!l || !r) return 0;
  return Math.abs(l.x - r.x);
}

export function movingAvg(arr, win) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - win + 1); j <= i; j++) { s += arr[j]; n++; }
    out.push(s / n);
  }
  return out;
}

// =====================================================================
// Fixed-rate resampling
// =====================================================================
// Every window in the trackers below is expressed in SAMPLES, not seconds:
// the 13-sample hip smoother, the 3-sample trend window, the 7-sample
// ankle series, the 20-sample rep debounce. Those numbers only carry their
// intended real-time meaning at the ~30 fps the original MediaPipe pipeline
// delivered.
//
// MoveNet in tfjs is much slower (typically 8-20 fps on a laptop), which
// stretches all of those windows in real time. The 13-sample hip smoother
// alone becomes 1.3 s — longer than a whole sit-to-stand — so the smoothed
// hip signal never travels the 0.08 amplitude needed to fire the
// RISING -> STANDING transition and repetitions silently stop counting.
//
// FixedRate resamples each measurement stream onto a constant clock,
// interpolating between consecutive inferences, so the windows keep their
// original real-time meaning no matter how fast inference actually runs.
export const SAMPLE_HZ = 30;
const SAMPLE_MS = 1000 / SAMPLE_HZ;

class FixedRate {
  constructor(hz = SAMPLE_HZ) {
    this.hz = hz;
    this.stepMs = 1000 / hz;
    this.reset();
  }

  reset() {
    this.prev = null;
    this.next = null;
    this.nextT = null;
  }

  /**
   * @param {number} tNow  timestamp of this inference
   * @param {number} value  measured value
   * @returns {{t:number,v:number}[]} samples emitted at the fixed rate
   */
  push(tNow, value) {
    if (value == null) return [];
    if (this.next === null) {
      this.next = { t: tNow, v: value };
      return [];
    }
    this.prev = this.next;
    this.next = { t: tNow, v: value };
    if (this.nextT === null) this.nextT = tNow + this.stepMs;

    const out = [];
    const span = this.next.t - this.prev.t;
    let guard = 0;
    while (this.nextT <= tNow && guard++ < 240) {
      const f = span > 0 ? (this.nextT - this.prev.t) / span : 1;
      out.push({ t: this.nextT, v: this.prev.v + (this.next.v - this.prev.v) * f });
      this.nextT += this.stepMs;
    }
    // If inference stalled for seconds, do not try to catch up forever.
    if (this.nextT < tNow - 1000) this.nextT = tNow + this.stepMs;
    return out;
  }
}

export function avg(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}

// Angle at point b formed by a-b-c, in degrees.
export function angle3pt(a, b, c) {
  const ang = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(a[1] - b[1], a[0] - b[0]);
  let deg = Math.abs((ang * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

// Angle at the knee formed by hip-knee-ankle, in degrees.
// 180 deg = fully straight leg, smaller = more flexion.
export function kneeAngleDegrees(pose, side = "left", minScore = DEFAULT_MIN_SCORE) {
  const hip = kp(pose, `${side}_hip`, minScore);
  const knee = kp(pose, `${side}_knee`, minScore);
  const ankle = kp(pose, `${side}_ankle`, minScore);
  if (!hip || !knee || !ankle) return null;
  return Math.round(angle3pt([hip.x, hip.y], [knee.x, knee.y], [ankle.x, ankle.y]));
}

// =====================================================================
// 1. Chair stand — 5x sit-to-stand
// =====================================================================
// Four-state machine over the smoothed hip-Y trajectory, ported from the
// original engine sample-for-sample:
//
//   SEATED  --hip rising fast-->  RISING
//   RISING  --rise complete-->    STANDING   (knee angles captured here)
//   STANDING--hip falling fast--> SITTING
//   SITTING --descent settled & debounce elapsed--> SEATED  (rep counted)
//
// Every window is in RESAMPLED samples at SAMPLE_HZ, not raw inference
// frames — see FixedRate above for why that distinction is the whole ball
// game. At 30 Hz these are the original 30 fps semantics: a 13-sample
// (~0.43 s) smoother, a 3-sample (~0.1 s) trend and a 20-sample (~0.67 s)
// rep debounce.
//
// Timing is first detected rise -> final detected sit (the SPPB definition),
// NOT the capture window length. Repetitions are only ever counted from real
// detected body movement; there is no manual counter, so a missed rep means
// the test must be re-run (reported as `incomplete`).
export class ChairStandCounter {
  constructor({ targetReps = 5 } = {}) {
    this.targetReps = targetReps;
    this.minAmplitude = 0.08;
    this.smoothWindow = 13;
    this.minRepSamples = 20;
    this.rate = new FixedRate(SAMPLE_HZ);
    this.reset();
  }

  reset() {
    this.series = [];
    this.smoothed = [];
    this.state = "SEATED";
    this.seatedRefY = null;
    this.riseStartY = 0;
    this.reps = 0;
    this.sampleCount = 0;
    this.lastRepSample = -this.minRepSamples;
    this.tFirstRise = null;
    this.tLastSit = null;
    this.kneeAngles = [];
    this.done = false;
    this.tracked = false;
    this.lastPose = null;
    this.rate.reset();
  }

  push(pose, tNow) {
    const hip = hipMidpoint(pose, 0.4);
    if (!hip) return;
    this.tracked = true;
    this.lastPose = pose;
    for (const s of this.rate.push(tNow, hip.y)) this._sample(s.v, s.t);
  }

  _sample(y, tS) {
    this.series.push(y);
    if (this.series.length > 90) this.series.shift();
    this.smoothed = movingAvg(this.series, this.smoothWindow);
    const cur = this.smoothed[this.smoothed.length - 1];

    if (this.seatedRefY === null && this.series.length >= 30) {
      this.seatedRefY = avg(this.series.slice(0, 30));
    }

    this.sampleCount += 1;
    if (this.smoothed.length < 5) return;

    const prevTrend = cur - this.smoothed[this.smoothed.length - 4];
    const samplesSinceRep = this.sampleCount - this.lastRepSample;
    const rangeOk = this.seatedRefY === null || cur > this.seatedRefY - this.minAmplitude;

    switch (this.state) {
      case "SEATED":
        if (prevTrend < -0.008 && rangeOk) {
          this.state = "RISING";
          this.riseStartY = cur;
          if (this.tFirstRise === null) this.tFirstRise = tS;
        }
        break;
      case "RISING":
        if (prevTrend >= -0.003) {
          if (Math.abs(this.riseStartY - cur) >= this.minAmplitude) {
            this.state = "STANDING";
            const pose = this.lastPose;
            const lk = pose ? kneeAngleDegrees(pose, "left", 0.3) : null;
            const rk = pose ? kneeAngleDegrees(pose, "right", 0.3) : null;
            if (lk != null && rk != null) this.kneeAngles.push([lk, rk]);
          } else {
            this.state = "SEATED";
          }
        }
        break;
      case "STANDING":
        if (prevTrend > 0.008) this.state = "SITTING";
        break;
      case "SITTING":
        if (prevTrend <= 0.003) {
          if (samplesSinceRep >= this.minRepSamples && this.reps < this.targetReps) {
            this.reps += 1;
            this.lastRepSample = this.sampleCount;
            this.tLastSit = tS;
            if (this.reps >= this.targetReps) this.done = true;
          }
          this.state = "SEATED";
        }
        break;
    }
  }

  result() {
    const reps = this.reps;
    const hasTiming = this.tFirstRise != null && this.tLastSit != null;
    const total = hasTiming ? (this.tLastSit - this.tFirstRise) / 1000 : null;

    // Integrity gate — identical to the original engine.
    const isInvalid = reps < this.targetReps || !hasTiming || total <= 0 || total > 60;

    const asym = this.kneeAngles.length
      ? avg(this.kneeAngles.map(([l, r]) => (Math.abs(l - r) / ((l + r) / 2)) * 100))
      : null;

    return {
      status: isInvalid ? (reps === 0 ? "no_reps_detected" : "incomplete") : "complete",
      repetitions: reps,
      target_reps: this.targetReps,
      total_time_seconds: isInvalid ? null : round1(total),
      rise_time_mean: isInvalid ? null : round1(total / Math.max(reps, 1)),
      knee_asymmetry_pct: asym == null ? null : Math.round(asym * 10) / 10,
      tracked: this.tracked,
      raw: { tFirstRise: this.tFirstRise, tLastSit: this.tLastSit, state: this.state },
    };
  }
}

// =====================================================================
// 2. Gait — timed 4 m walk
// =====================================================================
// Step detection is a two-signal cascade, ported from the original engine:
//   a) ankle vertical offset normalised by shoulder width (primary — resolves
//      a clean left/right alternation while the subject is fully in frame)
//   b) hip vertical oscillation (fallback when ankles are occluded or the
//      subject is walking away from the camera)
//
// Both signals are threshold crossings, so a single threshold is NOT enough to
// count a step: the signal must also return through a dead band before another
// step can be registered. Without that re-arm requirement, landmark jitter that
// oscillates either side of the threshold registers several "steps" inside one
// real footfall, which is what made the counter run visibly too fast. The
// re-arm band is 45% of the trigger threshold, i.e. a Schmitt trigger.
//
// A minimum inter-step interval is also enforced. The 4 m gait test is
// self-paced, so ~150 steps/min is a generous ceiling for any real walking
// adult (typical cadence is 100-120 steps/min); leaving headroom above that
// absorbs tracking noise without accepting a genuine double count.
// For reference the physiological maximum is roughly 200-220 steps/min.
//
// Operator starts the clock as the subject passes the start line and stops it
// as any body part crosses the 4 m line. When >= 4 steps were detected the
// engine times first-step -> last-step instead, because button presses carry
// 1-2 s of human reaction delay on both ends and would unfairly deflate the
// score. The button window is only used as a fallback for < 4 steps.
//
// Speed is a true 4.0 m / elapsed, i.e. m/s, which is what the official SPPB
// cutoffs expect. Step count feeds cadence and step length only, never the
// time-based sub-score, so the band changes cannot alter the SPPB gait score.
const MIN_STEP_MS = 400;
const ANKLE_TRIGGER = 0.22;
const ANKLE_REARM = ANKLE_TRIGGER * 0.45;
const HIP_TRIGGER = 0.06;
const HIP_REARM = HIP_TRIGGER * 0.45;

export class GaitTracker {
  constructor({ distance = 4.0 } = {}) {
    this.distance = distance;
    this.reset();
  }

  reset() {
    this.tStart = null;
    this.stepTimes = [];
    this.lastStepAt = 0;
    this.diffSeries = [];
    this.ankleArmed = 0;
    this.lastHipY = null;
    this.hipArmed = 0;
    this.hipHit = 0;
    this.tracked = false;
    this.mode = null;
    this.hipScale = 0.15;
    this.diffRate = new FixedRate(SAMPLE_HZ);
    this.hipRate = new FixedRate(SAMPLE_HZ);
  }

  start(tNow) {
    this.tStart = tNow;
    this.stepTimes = [];
    // The inter-step floor must not apply to the first footfall: with
    // lastStepAt = 0 any step detected in the first MIN_STEP_MS of a trial was
    // silently discarded, which showed up as a consistent count of N-1.
    this.lastStepAt = -Infinity;
    this.diffSeries = [];
    this.ankleArmed = 0;
    this.lastHipY = null;
    this.hipArmed = 0;
    this.hipHit = 0;
    this.diffRate.reset();
    this.hipRate.reset();
  }

  get stepCount() {
    return this.stepTimes.length;
  }

  _stepDue(tNow) {
    return tNow - this.lastStepAt >= MIN_STEP_MS;
  }

  _registerStep(tNow) {
    this.stepTimes.push(tNow);
    this.lastStepAt = tNow;
  }

  push(pose, tNow) {
    if (this.tStart == null) return;
    if (!pose) return;
    this.tracked = true;

    const sw = shoulderWidth(pose, 0.2);
    const usableScale = sw > 0.02 && sw < 0.6;
    const lA = kp(pose, "left_ankle", 0.45);
    const rA = kp(pose, "right_ankle", 0.45);

    // (a) ankle vertical offset normalised by shoulder width — primary signal,
    //     used only when the shoulders give a usable scale AND both ankles are
    //     confident, exactly as the original engine gated it.
    if (usableScale && lA && rA) {
      this._setMode("ankle");
      const diff = (rA.y - lA.y) / sw;
      for (const s of this.diffRate.push(tNow, diff)) this._ankleSample(s.v, s.t);
      return;
    }

    // (b) hip vertical oscillation — fallback. The original engine still ran
    //     this with a synthetic 0.15 scale when the shoulders were unusable;
    //     bailing out here instead is what made step detection unreliable.
    const hip = hipMidpoint(pose, 0.3);
    if (!hip) return;
    this._setMode("hip");
    this.hipScale = usableScale ? sw : 0.15;
    for (const s of this.hipRate.push(tNow, hip.y)) this._hipSample(s.v, s.t);
  }

  // Switching signal mid-walk would interpolate across two different
  // quantities, so the newly-entered stream starts clean.
  _setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === "ankle") {
      this.diffSeries = [];
      this.ankleArmed = 0;
      this.diffRate.reset();
    } else {
      this.lastHipY = null;
      this.hipArmed = 0;
      this.hipHit = 0;
      this.hipRate.reset();
    }
  }

  _ankleSample(diff, tNow) {
    this.diffSeries.push(diff);
    if (this.diffSeries.length > 7) this.diffSeries.shift();
    const s = avg(this.diffSeries);

    // Must re-cross the dead band before another step counts, otherwise noise
    // either side of the threshold books extra steps inside one footfall.
    if (this.ankleArmed === 0) {
      const excursion = s > ANKLE_REARM ? 1 : s < -ANKLE_REARM ? -1 : 0;
      if (excursion !== 0) {
        this.ankleArmed = excursion;
        // The very first excursion of a trial is itself a footfall: the patient
        // starts with the feet together, so the ankles separating for the first
        // time is step one, not a neutral re-arm. Counting it here is what stops
        // every trial reporting N-1 steps. Restricted to the first excursion so a
        // mid-walk mode switch can never inject a phantom step, and gated on the
        // 7-frame smoothed signal so single-frame landmark noise cannot reach it.
        if (this.stepTimes.length === 0 && this._stepDue(tNow)) this._registerStep(tNow);
      }
      return;
    }
    if (!this._stepDue(tNow)) return;

    if (this.ankleArmed === 1 && s < -ANKLE_TRIGGER) {
      this.ankleArmed = -1;
      this._registerStep(tNow);
    } else if (this.ankleArmed === -1 && s > ANKLE_TRIGGER) {
      this.ankleArmed = 1;
      this._registerStep(tNow);
    }
  }

  _hipSample(hipY, tNow) {
    if (this.lastHipY != null) {
      const d = (hipY - this.lastHipY) / this.hipScale;
      if (d > HIP_TRIGGER || d < -HIP_TRIGGER) this.hipHit = Math.min(2, this.hipHit + 1);
      else this.hipHit = 0;

      // Same re-arm requirement as the ankle path: the velocity has to come
      // back through a dead band before the opposite direction can count.
      if (this.hipArmed === 0) {
        if (d > HIP_REARM) this.hipArmed = 1;
        else if (d < -HIP_REARM) this.hipArmed = -1;
        return;
      }
      if (!this._stepDue(tNow)) return;

      if (this.hipArmed === 1 && d < -HIP_TRIGGER && this.hipHit >= 2) {
        this.hipArmed = -1; this.hipHit = 0; this._registerStep(tNow);
      } else if (this.hipArmed === -1 && d > HIP_TRIGGER && this.hipHit >= 2) {
        this.hipArmed = 1; this.hipHit = 0; this._registerStep(tNow);
      }
    }
    this.lastHipY = hipY;
  }

  /**
   * @param {number} tStop - timestamp of the operator's "Stop & record" click
   */
  result(tStop) {
    const buttonElapsed = this.tStart == null ? 0 : (tStop - this.tStart) / 1000;

    let elapsed = buttonElapsed;
    let timingBasis = "button-to-button";
    if (this.stepTimes.length >= 4) {
      elapsed = (this.stepTimes[this.stepTimes.length - 1] - this.stepTimes[0]) / 1000;
      timingBasis = "first step -> last step";
    }

    const steps = this.stepTimes.length;
    const speed = elapsed > 0 ? this.distance / elapsed : 0;
    const cadence = elapsed > 0 && steps >= 4 ? (steps / elapsed) * 60 : null;
    const stepLength = elapsed > 0 && steps >= 4 ? this.distance / steps : null;
    const isInvalid = elapsed <= 0 || speed <= 0;

    return {
      status: isInvalid ? "walk_not_detected" : "complete",
      time_seconds: isInvalid ? null : round1(elapsed),
      gait_speed_mps: isInvalid ? null : Math.round(speed * 100) / 100,
      cadence_steps_per_min: cadence == null ? null : Math.round(cadence),
      step_length_m: stepLength == null ? null : Math.round(stepLength * 100) / 100,
      step_count: steps,
      distance_m: this.distance,
      timing_basis: timingBasis,
      tracked: this.tracked,
    };
  }
}

// =====================================================================
// 3. Balance — 10 s quiet stance, postural sway proxy
// =====================================================================
// Hip-centre positions are smoothed, converted from normalised image units to
// CENTIMETRES using the subject's shoulder width against a 38.0 cm adult
// biacromial reference, then scored as RMS deviation from the mean stance
// position.
//
// A 1.2 s detection settle runs before the 10 s hold. Fewer than 15 recorded
// frames is reported as `insufficient_data` (the hold happened but the body
// could not be measured) rather than being silently scored.
const SHOULDER_CM = 38.0;
const BALANCE_DURATION_S = 10;
const BALANCE_READY_DELAY_MS = 1200;
const BALANCE_MIN_FRAMES = 15;

export class SwayTracker {
  constructor({ duration = BALANCE_DURATION_S, readyDelayMs = BALANCE_READY_DELAY_MS } = {}) {
    this.duration = duration;
    this.readyDelayMs = readyDelayMs;
    this.reset();
  }

  reset() {
    this.pts = [];
    this.shoulderW = [];
    this.tDetected = null;
    this.tStart = null;
    this.elapsed = 0;
    this.finished = false;
    this.tracked = false;
  }

  /**
   * @returns {"waiting"|"recording"|"done"} phase after this frame
   */
  push(pose, tNow) {
    if (this.finished) return "done";

    if (this.tStart === null) {
      if (this.tDetected === null) this.tDetected = tNow;
      if (tNow - this.tDetected >= this.readyDelayMs) this.tStart = tNow;
      return "waiting";
    }

    const el = (tNow - this.tStart) / 1000;
    this.elapsed = el;
    if (el > this.duration) {
      this.finished = true;
      return "done";
    }

    const hip = hipMidpoint(pose, 0.4);
    if (hip) {
      this.tracked = true;
      this.pts.push([hip.x, hip.y]);
      const sw = shoulderWidth(pose, 0.2);
      if (sw > 0) this.shoulderW.push(sw);
    }
    return "recording";
  }

  result() {
    const n = this.pts.length;
    // Report the time actually held. The original engine hard-coded 10 s,
    // which meant an operator who bailed out early still produced a result
    // that passed the >= 10 s validity gate in balanceSub(). A completed
    // hold reports the full protocol duration; a truncated one reports what
    // was measured so the gate can reject it.
    const completed = this.finished;
    const held = round1(this.elapsed);
    const duration = completed ? this.duration : held;

    if (n < BALANCE_MIN_FRAMES || !this.shoulderW.length || duration < this.duration) {
      return {
        status: "insufficient_data",
        duration_seconds: duration,
        held_seconds: held,
        rms_sway_cm: null,
        sway_path: null,
        valid: false,
        frames_analyzed: n,
        tracked: this.tracked,
      };
    }

    const xs = movingAvg(this.pts.map((p) => p[0]), 7);
    const ys = movingAvg(this.pts.map((p) => p[1]), 7);
    const avgShoulderPx = avg(this.shoulderW);
    const pxToCm = avgShoulderPx > 0 ? SHOULDER_CM / avgShoulderPx : 0;

    let rmsSwayCm = null;
    if (pxToCm > 0) {
      const mx = avg(xs);
      const my = avg(ys);
      let sq = 0;
      for (let i = 0; i < n; i++) {
        const dx = (xs[i] - mx) * pxToCm;
        const dy = (ys[i] - my) * pxToCm;
        sq += dx * dx + dy * dy;
      }
      rmsSwayCm = Math.sqrt(sq / n);
    }

    // Descriptive only — not used for scoring.
    let path = 0;
    for (let i = 1; i < n; i++) path += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    const pathRatio = avgShoulderPx > 0 ? path / avgShoulderPx : 0;

    return {
      status: pxToCm > 0 ? "complete" : "insufficient_data",
      duration_seconds: duration,
      held_seconds: held,
      rms_sway_cm: pxToCm > 0 ? Math.round(rmsSwayCm * 100) / 100 : null,
      sway_path: Math.round(pathRatio * 100) / 100,
      valid: pxToCm > 0,
      frames_analyzed: n,
      tracked: this.tracked,
    };
  }
}

// =====================================================================
// 4. Knee range of motion
// =====================================================================
// Flexion range = straightest observed angle (max, toward 180 deg) minus
// most-bent observed angle (min). Reported in degrees.
const ROM_DURATION_S = 10;
const ROM_MIN_SAMPLES = 10;

export class RomTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.angles = [];
    this.t0 = null;
    this.elapsed = 0;
  }
  start(tNow) {
    this.angles = [];
    this.t0 = tNow;
    this.elapsed = 0;
  }
  push(angle, tNow) {
    if (angle == null) return;
    if (this.t0 == null) this.t0 = tNow;
    this.elapsed = (tNow - this.t0) / 1000;
    this.angles.push(angle);
  }
  result() {
    const n = this.angles.length;
    const held = round1(this.elapsed);
    // Same reasoning as SwayTracker: a truncated run must not be reported as a
    // full 10 s capture.
    const duration = this.elapsed >= ROM_DURATION_S ? ROM_DURATION_S : held;
    if (n < ROM_MIN_SAMPLES || duration < ROM_DURATION_S) {
      return {
        status: "insufficient_data",
        duration_seconds: duration,
        held_seconds: held,
        minAngle: null,
        maxAngle: null,
        flexionRange: null,
        samples: n,
      };
    }
    const minAngle = Math.min(...this.angles);
    const maxAngle = Math.max(...this.angles);
    return {
      status: "complete",
      duration_seconds: duration,
      held_seconds: held,
      minAngle,
      maxAngle,
      flexionRange: Math.round(maxAngle - minAngle),
      samples: n,
    };
  }
}

// =====================================================================
// 5. TUG — Timed Up and Go (pure stopwatch)
// =====================================================================
// Clinically this is a stopwatch measurement, so no pose heuristics are
// layered on top: the operator starts as the patient begins to rise and stops
// once seated. Band thresholds are the commonly cited geriatrics cut points.
export const TUG_BANDS = [
  { maxSeconds: 10, band: "Low", score: 10 },
  { maxSeconds: 20, band: "Moderate", score: 45 },
  { maxSeconds: 30, band: "High", score: 75 },
  { maxSeconds: Infinity, band: "High", score: 95 },
];

export function tugPoints(seconds) {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) {
    return { band: "Incomplete", score: null };
  }
  const hit = TUG_BANDS.find((b) => seconds < b.maxSeconds);
  return { band: hit.band, score: hit.score };
}

// =====================================================================
// SPPB scoring engine
// =====================================================================
// Direct port of the original `window.SPPB.assess()`. Returns the three 0-4
// sub-scores, the "X / 12" display, the risk band, the 0-100 weighted risk
// composite, and a non-diagnostic summary sentence.
//
// TUG and knee ROM are NOT part of SPPB and deliberately do not contribute to
// `totalPts` or `risk100`; they feed the Functional domain in lib/fusion.js.
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Linear map onto 0-100 where 0 = best / lowest risk, 100 = worst / highest risk.
function normalize(value, best, worst, invert) {
  if (value == null || !isFinite(value)) return null;
  const pct = invert
    ? (best - value) / (best - worst)
    : (value - best) / (worst - best);
  return clamp(pct * 100, 0, 100);
}

// Official SPPB stopwatch cutoffs assume a human timer with zero detection
// overhead. This engine's rep window starts/stops on detected body movement,
// adding ~2.5 s of state-machine latency across 10 transitions, so the
// official 16.70 / 13.70 / 11.20 cutoffs are shifted by that constant.
function chairSub(totalTimeSeconds, repetitions, status) {
  if (status === "no_reps_detected" || status === "incomplete" ||
      !repetitions || repetitions <= 0 ||
      totalTimeSeconds == null || !isFinite(totalTimeSeconds) || totalTimeSeconds > 60) {
    return { pts: null, invalid: true, reason: "Test incomplete — please re-run" };
  }
  if (totalTimeSeconds >= 19.20) return { pts: 1, invalid: false };
  if (totalTimeSeconds >= 16.20) return { pts: 2, invalid: false };
  if (totalTimeSeconds >= 13.70) return { pts: 3, invalid: false };
  return { pts: 4, invalid: false };
}

function gaitSub(timeSeconds, status) {
  if (status === "walk_not_detected" || status === "incomplete" ||
      timeSeconds == null || !isFinite(timeSeconds) || timeSeconds <= 0) {
    return { pts: null, invalid: true, reason: "Test incomplete — please re-run" };
  }
  if (timeSeconds > 8.70) return { pts: 1, invalid: false };
  if (timeSeconds >= 6.21) return { pts: 2, invalid: false };
  if (timeSeconds >= 4.83) return { pts: 3, invalid: false };
  return { pts: 4, invalid: false };
}

// RMS sway is computed from hip-centre positions scaled by shoulder width.
// Even with smoothing, the sensor's noise floor sits around 1-2 cm — well
// above the ~0.3 cm true sway of a healthy young adult. Bands are calibrated
// to that noise floor so a steady healthy stance scores 4, not 0.
function balanceSub(durationSeconds, rmsSwayCm, valid, status) {
  if (status === "insufficient_data" || status === "incomplete" ||
      valid === false ||
      rmsSwayCm == null || !isFinite(rmsSwayCm) ||
      durationSeconds == null || !isFinite(durationSeconds) || durationSeconds < 10) {
    return { pts: null, invalid: true, reason: "Test incomplete — please re-run" };
  }
  if (rmsSwayCm > 6.00) return { pts: 0, invalid: false };
  if (rmsSwayCm >= 4.50) return { pts: 1, invalid: false };
  if (rmsSwayCm >= 3.00) return { pts: 2, invalid: false };
  if (rmsSwayCm >= 2.00) return { pts: 3, invalid: false };
  return { pts: 4, invalid: false };
}

/**
 * @param {object} input - { chair, gait, balance } raw tracker results
 * @returns {{
 *   subScores: { chair: object, gait: object, balance: object },
 *   sppbDisplay: string, totalPts: number|null, validMax: number,
 *   band: "low"|"moderate"|"high"|"incomplete", risk100: number|null,
 *   missing: string[], summaryText: string
 * }}
 */
export function scoreSPPB(input = {}) {
  const chairIn = input.chair || {};
  const gaitIn = input.gait || {};
  const balIn = input.balance || {};

  const chair = chairSub(
    chairIn.total_time_seconds !== undefined ? chairIn.total_time_seconds : chairIn.duration_seconds,
    chairIn.repetitions !== undefined ? chairIn.repetitions : chairIn.repetition_count,
    chairIn.status
  );
  const gait = gaitSub(
    gaitIn.time_seconds !== undefined ? gaitIn.time_seconds : gaitIn.duration_seconds,
    gaitIn.status
  );
  const bal = balanceSub(balIn.duration_seconds, balIn.rms_sway_cm, balIn.valid, balIn.status);

  const subScores = { chair, gait, balance: bal };

  let validPts = 0;
  let validMax = 0;
  const missing = [];

  if (!chair.invalid) { validPts += chair.pts; validMax += 4; } else { missing.push("Chair stand"); }
  if (!gait.invalid) { validPts += gait.pts; validMax += 4; } else { missing.push("Gait speed"); }
  if (!bal.invalid) { validPts += bal.pts; validMax += 4; } else { missing.push("Balance"); }

  let sppbDisplay;
  let band;
  if (validMax === 12) {
    sppbDisplay = `${validPts} / 12`;
    band = validPts <= 6 ? "high" : validPts <= 9 ? "moderate" : "low";
  } else if (validMax > 0) {
    sppbDisplay = `${validPts} / ${validMax} valid points`;
    const ratio = validPts / validMax;
    band = ratio <= 0.5 ? "high" : ratio <= 0.75 ? "moderate" : "low";
  } else {
    sppbDisplay = "Assessment incomplete";
    band = "incomplete";
  }

  // Weighted 0-100 composite risk score; missing/invalid tests are omitted and
  // their weights redistributed proportionally across the valid tests.
  const comps = [];

  // Gait: speed (dominant) + cadence + step length, so the composite reflects
  // more than raw time. The official SPPB sub-score above stays time-only.
  if (!gait.invalid && isFinite(gaitIn.gait_speed_mps)) {
    comps.push({ w: 0.45, v: normalize(gaitIn.gait_speed_mps, 1.0, 0.4, true) });
    if (isFinite(gaitIn.cadence_steps_per_min)) {
      comps.push({ w: 0.20, v: normalize(gaitIn.cadence_steps_per_min, 112, 70, true) });
    }
    if (isFinite(gaitIn.step_length_m)) {
      comps.push({ w: 0.20, v: normalize(gaitIn.step_length_m, 0.80, 0.40, true) });
    }
  }
  if (!chair.invalid && isFinite(chairIn.total_time_seconds)) {
    comps.push({ w: 0.35, v: normalize(chairIn.total_time_seconds, 13.7, 22.0, false) });
  }
  if (!bal.invalid && isFinite(balIn.rms_sway_cm)) {
    comps.push({ w: 0.20, v: normalize(balIn.rms_sway_cm, 2.0, 6.0, false) });
  }

  const wsum = comps.reduce((s, c) => s + c.w, 0);
  const risk100 = wsum > 0
    ? Math.round(comps.reduce((s, c) => s + c.w * c.v, 0) / wsum)
    : null;

  let summaryText;
  if (validMax === 0) {
    summaryText = "Functional mobility assessment incomplete — please re-run the tests.";
  } else if (missing.length > 0) {
    summaryText =
      `Valid results obtained for ${3 - missing.length} of 3 tests (${sppbDisplay}). ` +
      `${missing.join(", ")} test(s) incomplete and require re-testing.`;
  } else {
    const lowRiskTests = [];
    const modHighRiskTests = [];
    if (chair.pts >= 3) lowRiskTests.push("chair stand time"); else modHighRiskTests.push("chair stand time");
    if (gait.pts >= 3) lowRiskTests.push("gait speed"); else modHighRiskTests.push("gait speed");
    if (bal.pts >= 3) lowRiskTests.push("balance sway"); else modHighRiskTests.push("balance sway");

    if (modHighRiskTests.length === 0) {
      summaryText = "Gait speed, chair stand time and balance sway suggest low functional risk.";
    } else if (lowRiskTests.length === 0) {
      summaryText = "Multiple test indicators suggest functional risk — screening results may warrant further evaluation.";
    } else {
      summaryText = modHighRiskTests.join(" and ") + " suggest functional risk indicator — " +
        lowRiskTests.join(" and ") + " within the measured screening range.";
    }
  }

  return {
    subScores,
    sppbDisplay,
    totalPts: validMax > 0 ? validPts : null,
    validMax,
    band,
    risk100,
    missing,
    summaryText,
  };
}

// Sub-score 0-4 -> 0-100 "higher is better" score, used for the per-test
// cards. The 0 point is only reachable by the balance proxy.
export function ptsToScore100(pts) {
  return { 4: 95, 3: 82, 2: 68, 1: 55, 0: 45 }[pts] ?? null;
}
