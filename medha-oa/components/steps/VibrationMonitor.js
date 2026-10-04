"use client";

import { useEffect, useRef } from "react";

// Oscilloscope-style waveform for a FIXED capture window — it runs once
// for `durationMs` while `active` is true, draws the trace, then stops and
// leaves the last frame on screen (like a captured reading), instead of
// animating forever.
//
// Two sources:
//   * `series` — a real captured signal (e.g. the band-passed live IMU trace
//     returned by /api/imu). Drawn as a static reading, auto-scaled, with no
//     animation, because it is an actual measurement and must not be faked.
//   * otherwise a synthetic preview driven by amplitude/jerk, used for the
//     simulated and manual-entry demos.
export default function VibrationMonitor({ amplitude = 0.1, jerk = 1, active = false, durationMs = 4000, onComplete, color = "#14b8a6", series = null }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const tRef = useRef(0);
  const historyRef = useRef([]);
  const startRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;

    function drawGrid() {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(148,163,184,0.15)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 24) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (let gy = 0; gy < h; gy += 16) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
    }

    // Real measurement: plot it and stop. No animation, no synthetic noise.
    if (Array.isArray(series) && series.length > 1) {
      drawGrid();
      let lo = Infinity, hi = -Infinity;
      for (const v of series) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const span = hi - lo || 1;
      const pad = h * 0.12;
      const usable = h - pad * 2;
      const step = (w - 1) / (series.length - 1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.forEach((v, i) => {
        const y = pad + (1 - (v - lo) / span) * usable;
        if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * step, y);
      });
      ctx.stroke();
      return;
    }

    if (!active) {
      // Idle state: flat grid, no waveform, no animation loop running.
      drawGrid();
      historyRef.current = [];
      return;
    }

    const freq = 0.15 + jerk * 0.08;
    const amp = Math.min(amplitude * (h * 0.9), h * 0.42);
    startRef.current = performance.now();
    historyRef.current = [];

    function frame(now) {
      const elapsed = now - startRef.current;
      tRef.current += 1;
      const noise = (Math.random() - 0.5) * amp * 0.5;
      const y = h / 2 + Math.sin(tRef.current * freq) * amp * 0.6 + noise;
      historyRef.current.push(y);
      if (historyRef.current.length > w) historyRef.current.shift();

      drawGrid();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      historyRef.current.forEach((py, i) => { if (i === 0) ctx.moveTo(i, py); else ctx.lineTo(i, py); });
      ctx.stroke();

      if (elapsed < durationMs) {
        rafRef.current = requestAnimationFrame(frame);
      } else if (onComplete) {
        onComplete();
      }
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, amplitude, jerk, durationMs, color, series]);

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={110}
      className="w-full rounded-xl bg-slate-900"
      style={{ imageRendering: "crisp-edges" }}
    />
  );
}
