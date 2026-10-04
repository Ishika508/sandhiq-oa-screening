"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import StepFrame from "./StepFrame";
import {
  Laptop, Cpu, Play, Square, CheckCircle2, AlertTriangle, Video,
  Armchair, Footprints, Timer, RotateCw, PersonStanding, ArrowRight,
} from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";
import {
  loadPoseModel, estimatePose, hipMidpoint, kneeAngleDegrees,
  keypointMap, kpScore, SKELETON_CONNECTIONS, TEST_FOCUS_JOINTS,
  ChairStandCounter, SwayTracker, GaitTracker, RomTracker,
  scoreSPPB, tugPoints, ptsToScore100,
} from "@/lib/pose/poseEngine";

const GAIT_DISTANCE_M = 4.0;
const BALANCE_DURATION_S = 10;
const ROM_DURATION_S = 10;
const BONE_MIN_SCORE = 0.4;
const JOINT_MIN_SCORE = 0.5;

const TESTS = [
  {
    key: "chairStand", label: "5x Chair Stand", icon: Armchair, needsPose: true,
    auto: true, sppbKey: "chair",
    steps: [
      "Place a sturdy chair side-on to the camera — the person's whole body must be visible.",
      "The person sits upright, feet flat on the floor, arms crossed over the chest.",
      "Click Start, then stand up fully and sit back down — repeat 5 times.",
      "Repetitions are counted automatically from real body movement. If one is missed, re-run the test (there is no manual counter).",
      "The result records itself after the 5th detected repetition.",
    ],
  },
  {
    key: "gait", label: "4m Gait Walk", icon: Footprints, needsPose: true,
    auto: false, timed: true, sppbKey: "gait",
    steps: [
      "Mark two lines on the floor exactly 4 metres apart.",
      "The person stands behind the start line, facing the finish line, walking at their normal pace.",
      "Click Start the moment they take their first step past the start line.",
      "The instant any part of their body crosses the 4 m line, click Stop & record.",
    ],
  },
  {
    key: "balance", label: "Balance / Sway", icon: PersonStanding, needsPose: true,
    auto: true, sppbKey: "balance",
    steps: [
      "The person stands facing the camera about 2–3 m away — whole body visible head to feet.",
      "Feet together (or as close as comfortable), arms relaxed at the sides, eyes open.",
      "Click Start — after a short ready delay the 10-second hold begins automatically.",
      "Stand perfectly still: no talking, no weight-shifting, eyes on a fixed point ahead.",
      "The test ends by itself after 10 seconds and records the sway score.",
    ],
  },
  {
    key: "tug", label: "Timed Up & Go (TUG)", icon: Timer, needsPose: false,
    auto: false, timed: true,
    steps: [
      "Position a chair so the person can rise, walk 3 metres, turn, walk back and sit down.",
      "Click Start as they begin to rise — the stopwatch starts.",
      "Click Stop the moment they are seated again.",
    ],
  },
  {
    key: "rom", label: "Knee Range of Motion", icon: RotateCw, needsPose: true,
    auto: true, duration: ROM_DURATION_S,
    steps: [
      "Ask the person to sit or lie with the leg fully visible from the side.",
      "Click Start, then slowly bend and straighten the knee through its full comfortable range 2–3 times.",
      "Keep the whole hip, knee and ankle in frame for the full 10 seconds.",
    ],
  },
];

const EMPTY_HUD = { reps: 0, steps: 0, leftSec: 0, elapsed: 0, phase: "idle", angle: null, tracked: false };

export default function CvStep({ initialData, onSave }) {
  const { t } = useT();
  const [cameraMode, setCameraMode] = useState(initialData?.cameraMode || "laptop");
  const [radxaUrl, setRadxaUrl] = useState(initialData?.radxaUrl || "");
  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState("");
  const [streamActive, setStreamActive] = useState(false);
  const [results, setResults] = useState(initialData?.results || {});
  const [testIndex, setTestIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [hud, setHud] = useState(EMPTY_HUD);

  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const traceRef = useRef(null);
  const rafRef = useRef(null);
  const trackerRef = useRef(null);
  const streamRef = useRef(null);
  const traceHistoryRef = useRef([]);
  const runRef = useRef({ running: false, t0: 0 });
  const hudKeyRef = useRef("");

  const currentTest = TESTS[testIndex];
  const isLastTest = testIndex === TESTS.length - 1;

  const getFrameSource = useCallback(
    () => (cameraMode === "laptop" ? videoRef.current : imgRef.current),
    [cameraMode]
  );

  useEffect(() => {
    let alive = true;
    setModelLoading(true);
    loadPoseModel()
      .then(() => { if (alive) setModelReady(true); })
      .catch((e) => { if (alive) setModelError(e.message || "Could not load pose model"); })
      .finally(() => { if (alive) setModelLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => () => stopEverything(), []);

  async function startLaptopCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setStreamActive(true);
      setModelError("");
    } catch (e) {
      setModelError("Could not access laptop camera: " + e.message);
    }
  }

  function startRadxaCamera() {
    if (!radxaUrl) { setModelError("Enter the Radxa camera stream URL first."); return; }
    setStreamActive(true);
    setModelError("");
  }

  function stopEverything() {
    runRef.current.running = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    trackerRef.current = null;
    traceHistoryRef.current = [];
    hudKeyRef.current = "";
    setHud(EMPTY_HUD);
    setStreamActive(false);
    setRunning(false);
  }

  // Only push HUD updates into React state when a displayed value actually
  // changes — the capture loop runs at frame rate.
  function pushHud(next) {
    const key = `${next.reps}|${next.steps}|${next.leftSec}|${next.elapsed.toFixed(1)}|${next.phase}|${next.angle}|${next.tracked}`;
    if (key === hudKeyRef.current) return;
    hudKeyRef.current = key;
    setHud(next);
  }

  function newTracker(key, t0) {
    switch (key) {
      case "chairStand": return new ChairStandCounter({ targetReps: 5 });
      case "gait": { const g = new GaitTracker({ distance: GAIT_DISTANCE_M }); g.start(t0); return g; }
      case "balance": return new SwayTracker({ duration: BALANCE_DURATION_S });
      case "rom": { const r = new RomTracker(); r.start(t0); return r; }
      default: return null;
    }
  }

  function beginTest() {
    if (runRef.current.running) return;
    traceHistoryRef.current = [];
    hudKeyRef.current = "";
    runRef.current = { running: true, t0: performance.now() };
    trackerRef.current = newTracker(currentTest.key, runRef.current.t0);
    setRunning(true);
    setHud({ ...EMPTY_HUD, phase: currentTest.timed ? "running" : "starting" });
  }

  function finishTest(test, tStop) {
    if (!runRef.current.running) return;
    runRef.current.running = false;

    const tr = trackerRef.current;
    const tEnd = tStop ?? performance.now();
    let value;

    switch (test.key) {
      case "chairStand":
        value = tr.result();
        break;
      case "gait":
        value = tr.result(tEnd);
        break;
      case "balance":
        value = tr.result();
        break;
      case "rom":
        value = tr.result();
        break;
      case "tug": {
        const seconds = Math.round(((tEnd - runRef.current.t0) / 1000) * 10) / 10;
        value = { status: seconds > 0 ? "complete" : "incomplete", seconds, ...tugPoints(seconds) };
        break;
      }
    }

    trackerRef.current = null;
    setResults((r) => ({ ...r, [test.key]: value }));
    setRunning(false);
    setHud(EMPTY_HUD);
    hudKeyRef.current = "";
  }

  function operatorStop() {
    if (!runRef.current.running) return;
    finishTest(currentTest, performance.now());
  }

  // One continuous inference loop for the whole time the camera is live. The
  // skeleton is drawn every frame regardless of whether a test is running, so
  // the operator can frame the subject before pressing Start; the tracker is
  // only fed while a test is actually running.
  useEffect(() => {
    if (!streamActive) return;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      const test = currentTest;
      const source = getFrameSource();
      const tNow = performance.now();

      // The overlay runs for every test (including TUG) so the operator always
      // sees the tracked body; only the tracker needs a live pose.
      if (source && modelReady) {
        try {
          const pose = await estimatePose(source);
          if (cancelled) return;
          drawOverlay(pose, test.key);
          if (runRef.current.running) stepFrame(test, trackerRef.current, tNow, pose);
          else previewFrame(test, pose);
        } catch {
          // Leave the last HUD in place — a dropped frame must not wipe a
          // count the operator is watching.
        }
      } else if (runRef.current.running) {
        stepFrame(test, trackerRef.current, tNow, null);
      }

      if (!cancelled) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [streamActive, currentTest, getFrameSource, modelReady]);

  function previewFrame(test, pose) {
    pushHud({ ...EMPTY_HUD, phase: "ready", tracked: !!pose });
  }

  // TUG is a pure stopwatch, so it runs with no tracker at all; every other
  // test needs one and bails if it is missing.
  function stepFrame(test, tr, tNow, pose) {
    if (!tr && test.key !== "tug") return;
    const elapsed = (tNow - runRef.current.t0) / 1000;
    let autoFinish = false;
    let next = {
      ...EMPTY_HUD,
      elapsed: Math.round(elapsed * 10) / 10,
      phase: test.timed ? "running" : "recording",
      tracked: !!pose,
    };

    switch (test.key) {
      case "chairStand": {
        if (pose) tr.push(pose, tNow);
        next.reps = tr.reps;
        next.phase = pose ? tr.state.toLowerCase() : "searching";
        next.tracked = !!pose;
        autoFinish = tr.done;
        break;
      }
      case "gait": {
        if (pose) tr.push(pose, tNow);
        next.phase = "running";
        next.steps = tr.stepCount;
        next.tracked = !!pose;
        break;
      }
      case "balance": {
        const phase = tr.push(pose, tNow);
        next.phase = phase;
        next.leftSec = Math.max(0, Math.ceil(BALANCE_DURATION_S - tr.elapsed));
        next.tracked = tr.tracked;
        autoFinish = phase === "done";
        break;
      }
      case "rom": {
        if (pose) {
          const angle = kneeAngleDegrees(pose, "left") ?? kneeAngleDegrees(pose, "right");
          tr.push(angle, tNow);
          next.angle = angle;
        }
        next.phase = "recording";
        next.leftSec = Math.max(0, Math.ceil(ROM_DURATION_S - elapsed));
        next.tracked = !!pose;
        autoFinish = elapsed >= ROM_DURATION_S;
        break;
      }
      case "tug": {
        next.phase = "running";
        break;
      }
    }

    if (pose && test.needsPose) {
      const v = test.key === "chairStand" ? hipMidpoint(pose)?.y
        : test.key === "balance" || test.key === "gait" ? hipMidpoint(pose)?.x
        : test.key === "rom" ? next.angle
        : null;
      if (v != null) {
        traceHistoryRef.current.push(v);
        if (traceHistoryRef.current.length > 200) traceHistoryRef.current.shift();
      }
    }

    pushHud(next);
    if (autoFinish) finishTest(test, tNow);
  }

  // Skeleton overlay. MoveNet returns NORMALISED 0-1 coordinates, so every
  // point must be mapped into canvas pixel space before drawing — drawing the
  // raw values collapses the whole figure into a 1x1 px corner.
  //
  // The video/img is displayed with `object-cover`, so the source frame is
  // scaled to fill and centre-cropped. The mapping below reproduces that
  // transform so the skeleton stays glued to the body on screen at any aspect
  // ratio, and the canvas is sized to its *displayed* CSS box (x devicePixelRatio)
  // so the line widths stay crisp on retina/HiDPI screens.
  function drawOverlay(pose, testKey) {
    const canvas = canvasRef.current;
    const source = getFrameSource();
    if (!canvas || !source) return;

    const sw = source.videoWidth || source.naturalWidth || 0;
    const sh = source.videoHeight || source.naturalHeight || 0;
    if (!sw || !sh) return;

    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width, cssH = rect.height;
    if (!cssW || !cssH) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const scale = Math.max(cssW / sw, cssH / sh);
    const offX = (cssW - sw * scale) / 2;
    const offY = (cssH - sh * scale) / 2;
    const px = (k) => k.x * sw * scale + offX;
    const py = (k) => k.y * sh * scale + offY;

    const map = keypointMap(pose);
    const focus = TEST_FOCUS_JOINTS[testKey] || [];
    const focusSet = new Set(focus);

    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(45, 212, 191, 0.55)";
    ctx.shadowBlur = Math.max(2, cssW / 220);
    for (const pass of [0, 1]) {
      const isFocus = pass === 1;
      ctx.lineWidth = isFocus ? Math.max(3.5, cssW / 230) : Math.max(2, cssW / 430);
      ctx.strokeStyle = isFocus ? "rgba(94, 234, 212, 0.98)" : "rgba(74, 222, 128, 0.85)";
      ctx.beginPath();
      for (const [aName, bName] of SKELETON_CONNECTIONS) {
        const a = map[aName], b = map[bName];
        if (!a || !b) continue;
        if (kpScore(a) < BONE_MIN_SCORE || kpScore(b) < BONE_MIN_SCORE) continue;
        if (isFocus !== (focusSet.has(aName) && focusSet.has(bName))) continue;
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    const rFocus = Math.max(4, cssW / 130);
    const rRest = Math.max(3, cssW / 210);
    for (const name of Object.keys(map)) {
      const k = map[name];
      if (kpScore(k) < JOINT_MIN_SCORE) continue;
      const isFocus = focusSet.has(name);
      const x = px(k), y = py(k), r = isFocus ? rFocus : rRest;
      if (isFocus) {
        ctx.beginPath();
        ctx.arc(x, y, r + Math.max(3, cssW / 150), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(94, 234, 212, 0.18)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isFocus ? "#5eead4" : "rgba(240, 253, 250, 0.97)";
      ctx.fill();
      if (isFocus) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(6, 78, 59, 0.6)";
        ctx.stroke();
      }
    }
  }

  // Scrolling trace of whatever signal the active test tracks.
  useEffect(() => {
    if (!running || currentTest.key === "tug" || !currentTest.needsPose) return;
    const canvas = traceRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    function draw() {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(148,163,184,0.15)";
      for (let gx = 0; gx < w; gx += 26) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      const hist = traceHistoryRef.current;
      if (hist.length > 1) {
        const min = Math.min(...hist), max = Math.max(...hist);
        const range = max - min || 1;
        ctx.strokeStyle = "#0d9488";
        ctx.lineWidth = 2;
        ctx.beginPath();
        hist.forEach((v, i) => {
          const x = (i / (hist.length - 1)) * w;
          const y = h - ((v - min) / range) * (h - 10) - 5;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [running, currentTest.key]);

  function advanceTest() {
    const firstPending = TESTS.findIndex((tst) => !results[tst.key]);
    if (firstPending !== -1 && firstPending !== testIndex) setTestIndex(firstPending);
    else if (!isLastTest) setTestIndex((i) => i + 1);
  }

  function selectTest(i) {
    if (runRef.current.running) return;
    setTestIndex(i);
    hudKeyRef.current = "";
    setHud(EMPTY_HUD);
  }

  const sppb = scoreSPPB({
    chair: results.chairStand,
    gait: results.gait,
    balance: results.balance,
  });

  function handleSaveAll() {
    onSave({
      cameraMode,
      radxaUrl,
      results,
      sppbTotal: sppb.totalPts,
      sppbValidMax: sppb.validMax,
      sppbPct: sppb.validMax > 0 ? Math.round((sppb.totalPts / sppb.validMax) * 100) : null,
      sppbRisk100: sppb.risk100,
      sppbBand: sppb.band,
      sppbBreakdown: sppb,
    });
  }

  const allDone = TESTS.every((tst) => results[tst.key]);
  const Icon = currentTest.icon;
  const timed = !!currentTest.timed;
  const doneHere = !!results[currentTest.key];
  const panel = livePanel();
  const trackingText = !streamActive
    ? modelLoading ? "Loading pose model…" : "Camera off"
    : hud.tracked ? "Tracking · counting" : "Searching for pose…";

  return (
    <StepFrame
      icon={Video}
      title={t("steps.cvTitle")}
      subtitle={t("steps.cvSubtitle")}
      reference="Guralnik et al., J Gerontology 1994 (SPPB) · Podsiadlo & Richardson 1991 (TUG)"
    >
      <div className="flex gap-2 mb-4">
        <ModeButton icon={Laptop} label="Laptop Camera" active={cameraMode === "laptop"} onClick={() => { stopEverything(); setCameraMode("laptop"); }} />
        <ModeButton icon={Cpu} label="Radxa Camera" active={cameraMode === "radxa"} onClick={() => { stopEverything(); setCameraMode("radxa"); }} />
      </div>

      {cameraMode === "radxa" && (
        <div className="mb-4">
          <label className="label">Radxa stream URL</label>
          <input className="input" placeholder="http://192.168.50.2:8080/stream" value={radxaUrl} onChange={(e) => setRadxaUrl(e.target.value)} />
        </div>
      )}

      {modelError && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 mb-4 flex items-center gap-2">
          <AlertTriangle size={16} /> {modelError}
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 mb-5">
        {TESTS.map((tst, i) => {
          const TIcon = tst.icon;
          const value = results[tst.key];
          const isActive = i === testIndex;
          const isRunning = isActive && running;
          const line = value ? resultLine(tst, value) : null;
          return (
            <button
              key={tst.key}
              onClick={() => selectTest(i)}
              disabled={running}
              className={`text-left rounded-2xl border px-3.5 py-3 transition-all ${
                isActive
                  ? "border-clinical-400 bg-clinical-50/70 shadow-sm"
                  : "border-slate-200/70 bg-white/40 hover:bg-white/70"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className={`icon-tile !h-8 !w-8 shrink-0 ${value ? "!bg-emerald-100/80 !text-emerald-700" : ""}`}>
                  {value ? <CheckCircle2 size={15} /> : <TIcon size={15} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-800 truncate">{tst.label}</span>
                    <span
                      className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                        isRunning ? "bg-amber-100 text-amber-700"
                        : value ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {isRunning ? "Running" : value ? "Done" : "Pending"}
                    </span>
                  </div>

                  {isRunning ? (
                    <div className="text-[12px] font-semibold text-clinical-700 mt-1 tabular-nums">
                      {liveValueFor(tst, hud)}
                    </div>
                  ) : line ? (
                    <div className={`text-[11.5px] mt-0.5 ${value.status === "incomplete" ? "text-amber-700" : "text-slate-500"}`}>
                      {line}
                    </div>
                  ) : (
                    <div className="text-[11.5px] text-slate-400 mt-0.5">Not recorded yet</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Camera and controls sit side by side. The grid items stretch (no
          items-start), so the camera fills the full height of the row set by
          the control column instead of leaving dead space beneath it. The
          4:3 aspect only applies on narrow, stacked layouts. */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative bg-slate-900 rounded-2xl overflow-hidden aspect-[4/3] lg:aspect-auto lg:min-h-[440px]">
          {cameraMode === "laptop" ? (
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
          ) : (
            radxaUrl && <img ref={imgRef} src={radxaUrl} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover" alt="Radxa camera stream" />
          )}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
            <span
              className={`inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-50 bg-slate-900/70 border border-emerald-300/25 rounded-full px-2.5 py-1 backdrop-blur-sm ${
                streamActive && hud.tracked ? "" : "opacity-70"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  !streamActive ? "bg-slate-400" : hud.tracked ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {trackingText}
            </span>

            {streamActive && running && (
              <span className="shrink-0 text-[12.5px] font-semibold font-mono text-emerald-50 bg-slate-900/70 border border-emerald-300/25 rounded-full px-2.5 py-1 tabular-nums">
                {hud.elapsed.toFixed(1)} s
              </span>
            )}
          </div>

          {streamActive && currentTest.key === "rom" && hud.angle != null && (
            <span className="absolute bottom-3 left-3 text-[12px] font-semibold font-mono text-emerald-50 bg-slate-900/70 border border-emerald-300/25 rounded-full px-2.5 py-1 tabular-nums">
              Knee {hud.angle}°
            </span>
          )}

          {!streamActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[13px] text-slate-300/90 max-w-[26ch]">
                {modelLoading
                  ? "Loading the on-device pose model…"
                  : "Position the camera so the participant's full body is visible, facing the lens."}
              </p>
              <button className="btn-primary" disabled={!modelReady || modelLoading} onClick={cameraMode === "laptop" ? startLaptopCamera : startRadxaCamera}>
                <Play size={16} /> {modelLoading ? "Loading model…" : "Start Camera"}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="icon-tile !h-8 !w-8"><Icon size={15} /></div>
              <div className="text-[13px] font-semibold text-slate-800">{currentTest.label}</div>
            </div>
            <ol className="text-[12.5px] text-slate-600 list-decimal pl-4 space-y-1 leading-snug">
              {currentTest.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>

          <div
            className="rounded-2xl px-5 py-4 text-white"
            style={{ background: "linear-gradient(135deg,#0284c7,#0d9488)" }}
          >
            <div className="text-[12px] font-medium opacity-85">{panel.label}</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={`text-5xl font-semibold leading-none tabular-nums ${panel.ok ? "text-white" : "text-white/45"}`}>
                {panel.value}
              </span>
              <span className="text-[15px] font-semibold opacity-80 whitespace-nowrap">{panel.unit}</span>
            </div>
          </div>

          {panel.progress != null && (
            <div>
              <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${panel.progress * 100}%`, background: "linear-gradient(90deg,#0284c7,#0d9488)" }}
                />
              </div>
              <p className="text-[12px] text-slate-500 mt-1.5">{panel.state}</p>
            </div>
          )}
          {panel.progress == null && (
            <p className="text-[12px] text-slate-500 -mt-1.5">{panel.state}</p>
          )}

          <div className="flex flex-col gap-2">
            {!doneHere ? (
              running ? (
                timed ? (
                  <button className="btn-danger w-full" onClick={operatorStop}>
                    <Square size={14} /> {currentTest.key === "tug" ? "Stop — patient is seated" : "Stop & record"}
                  </button>
                ) : (
                  <button className="btn-secondary w-full" onClick={operatorStop}>
                    <Square size={14} /> Record early
                  </button>
                )
              ) : (
                <button className="btn-primary w-full" onClick={beginTest} disabled={!streamActive}>
                  <Play size={14} /> Start {currentTest.label}
                </button>
              )
            ) : (
              <div className="flex flex-col gap-2">
                <ResultSummary test={currentTest} value={results[currentTest.key]} sub={subScoreFor(currentTest, sppb)} />
                <button className="btn-secondary w-full" onClick={advanceTest}>
                  {allDone ? "Review results" : "Next test"} <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>

          {streamActive && currentTest.needsPose && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Live signal trace</div>
              <canvas ref={traceRef} width={520} height={64} className="w-full rounded-xl bg-slate-900" />
            </div>
          )}
        </div>
      </div>

      <SppbPanel sppb={sppb} results={results} allDone={allDone} />

      <button className="btn-primary w-full mt-4" disabled={!allDone} onClick={handleSaveAll}>
        <CheckCircle2 size={16} /> {t("common.save")}
      </button>
    </StepFrame>
  );

  function livePanel() {
    if (!running) {
      return {
        label: doneHere ? "Last result" : "Live counter",
        value: doneHere ? "—" : "—",
        unit: doneHere ? "" : "",
        progress: null,
        ok: streamActive && currentTest.needsPose ? hud.tracked : true,
        state: !streamActive
          ? "Start the camera to begin tracking."
          : doneHere
            ? "Result recorded — pick another test or re-run this one."
            : currentTest.needsPose
              ? "Subject is being tracked live. Press Start when the participant is ready."
              : "Press Start to begin the stopwatch.",
      };
    }

    if (currentTest.key === "chairStand") {
      return {
        label: "Reps completed",
        value: String(hud.reps),
        unit: "/ 5",
        progress: Math.min(1, hud.reps / 5),
        ok: hud.tracked,
        state: hud.tracked
          ? `State: ${hud.phase} — stand up and sit down fully.`
          : "Waiting for camera tracking — repetitions can only be counted from real movement.",
      };
    }
    if (currentTest.key === "gait") {
      return {
        label: "Steps detected",
        value: String(hud.steps),
        unit: hud.steps === 1 ? "step" : "steps",
        progress: null,
        ok: hud.tracked,
        state: "Walking… press Stop & record the moment any body part crosses the 4 m line.",
      };
    }
    if (currentTest.key === "balance") {
      return {
        label: "Time remaining",
        value: String(hud.leftSec),
        unit: `/ ${BALANCE_DURATION_S} s`,
        progress: Math.min(1, (BALANCE_DURATION_S - hud.leftSec) / BALANCE_DURATION_S),
        ok: hud.tracked,
        state: hud.phase === "waiting"
          ? "Hold still — recording starts shortly…"
          : "Stand as still as possible…",
      };
    }
    if (currentTest.key === "rom") {
      return {
        label: "Time remaining",
        value: String(hud.leftSec),
        unit: `/ ${ROM_DURATION_S} s`,
        progress: Math.min(1, (ROM_DURATION_S - hud.leftSec) / ROM_DURATION_S),
        ok: hud.tracked,
        state: "Bend and straighten the knee through its full comfortable range.",
      };
    }
    return {
      label: "Elapsed",
      value: hud.elapsed.toFixed(1),
      unit: "s",
      progress: null,
      ok: true,
      state: "Stop the clock once the patient is seated again.",
    };
  }
}

function liveValueFor(test, hud) {
  switch (test.key) {
    case "chairStand": return `${hud.reps} of 5 reps`;
    case "gait": return `${hud.steps} ${hud.steps === 1 ? "step" : "steps"} detected`;
    case "balance": return `${hud.leftSec} s remaining`;
    case "rom": return `${hud.leftSec} s remaining${hud.angle != null ? ` · ${hud.angle}°` : ""}`;
    case "tug": return `${hud.elapsed.toFixed(1)} s elapsed`;
    default: return "";
  }
}

function resultLine(test, value) {
  switch (test.key) {
    case "chairStand":
      return value.status === "complete"
        ? `${value.repetitions} reps in ${value.total_time_seconds}s`
        : `Only ${value.repetitions} of ${value.target_reps} reps — re-run`;
    case "gait":
      return value.status === "complete"
        ? `${value.gait_speed_mps} m/s over ${value.time_seconds}s`
        : "Walk not detected — re-run";
    case "balance":
      return value.status === "complete"
        ? `${value.rms_sway_cm} cm RMS sway`
        : "Insufficient tracking — re-run";
    case "tug":
      return `${value.seconds}s — ${value.band} band`;
    case "rom":
      return value.status === "complete"
        ? `${value.flexionRange}° flexion range`
        : "Insufficient tracking — re-run";
    default:
      return "";
  }
}

function subScoreFor(test, sppb) {
  if (!test.sppbKey) return null;
  return sppb.subScores[test.sppbKey];
}

function SppbPanel({ sppb, results, allDone }) {
  const { subScores } = sppb;
  if (!allDone) {
    return (
      <div className="rounded-xl bg-white/40 border border-slate-200/70 p-4 mt-5">
        <div className="text-sm text-slate-500">
          SPPB Total: {sppb.sppbDisplay}
          {sppb.missing.length > 0 && (
            <span className="text-xs text-slate-400"> · pending: {sppb.missing.join(", ")}</span>
          )}
        </div>
      </div>
    );
  }

  const risk = sppb.risk100;
  const bandLabel = { low: "Low Risk", moderate: "Moderate Risk", high: "High Risk", incomplete: "Incomplete" }[sppb.band];

  return (
    <div className="rounded-xl bg-white/50 border border-slate-200/70 p-4 mt-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-slate-700">SPPB Total: {sppb.sppbDisplay}</div>
        {risk != null && (
          <div className="text-sm font-semibold text-slate-700">
            Risk {risk}/100 <span className="text-xs font-normal text-slate-500">({bandLabel})</span>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 grid grid-cols-2 gap-1">
        <div>Chair stand: {results.chairStand.repetitions} reps{results.chairStand.total_time_seconds != null && ` in ${results.chairStand.total_time_seconds}s`} · {subScores.chair.invalid ? "—" : `${subScores.chair.pts}/4`}</div>
        <div>Gait speed: {results.gait.gait_speed_mps != null ? `${results.gait.gait_speed_mps} m/s` : "—"} · {subScores.gait.invalid ? "—" : `${subScores.gait.pts}/4`}</div>
        <div>TUG: {results.tug.seconds}s ({results.tug.band})</div>
        <div>Knee ROM: {results.rom.flexionRange != null ? `${results.rom.flexionRange}° range` : "—"}</div>
        <div>Balance sway RMS: {results.balance.rms_sway_cm != null ? `${results.balance.rms_sway_cm} cm` : "—"} · {subScores.balance.invalid ? "—" : `${subScores.balance.pts}/4`}</div>
      </div>

      {sppb.missing.length > 0 && (
        <p className="text-xs text-amber-600 mt-2">Incomplete: {sppb.missing.join(", ")} — re-run for a full score.</p>
      )}
      <p className="text-[11px] text-slate-400 mt-2">{sppb.summaryText}</p>
    </div>
  );
}

function ModeButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? "border-clinical-400 bg-clinical-50/70 text-clinical-700" : "border-slate-200/70 bg-white/40 text-slate-500 hover:bg-white/70"
      }`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

function ResultSummary({ test, value, sub }) {
  const invalid = !sub || sub.invalid;
  const scoreTxt = invalid ? "Incomplete" : `${sub.pts}/4`;

  let body;
  switch (test.key) {
    case "chairStand":
      body = value.status === "complete"
        ? `${value.repetitions} reps in ${value.total_time_seconds}s`
        : `Only ${value.repetitions} of ${value.target_reps} reps detected — re-run`;
      break;
    case "gait":
      body = value.status === "complete"
        ? `${value.gait_speed_mps} m/s over ${value.time_seconds}s (${value.timing_basis})`
        : "Walk not detected — re-run";
      break;
    case "balance":
      body = value.status === "complete"
        ? `${value.rms_sway_cm} cm RMS sway over ${value.duration_seconds}s`
        : "Insufficient tracking data — re-run";
      break;
    case "tug":
      body = `${value.seconds}s — ${value.band} risk band`;
      break;
    case "rom":
      body = value.status === "complete"
        ? `Flexion range ${value.flexionRange}° (${value.minAngle}°–${value.maxAngle}°)`
        : "Insufficient tracking data — re-run";
      break;
    default:
      body = "";
  }

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/60 px-3.5 py-2.5 min-w-0">
      <div className={`text-[13px] font-medium ${invalid && test.sppbKey ? "text-amber-700" : "text-teal-700"}`}>{body}</div>
      {test.sppbKey && (
        <div className="text-[11px] text-slate-400 mt-0.5">
          Sub-score {scoreTxt}
          {!invalid && ptsToScore100(sub.pts) != null && ` · ${ptsToScore100(sub.pts)}/100`}
        </div>
      )}
    </div>
  );
}
