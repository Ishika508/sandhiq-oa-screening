"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import StepFrame from "./StepFrame";
import VibrationMonitor from "./VibrationMonitor";
import {
  Radio, Sparkles, PenLine, CheckCircle2, Activity, AlertTriangle,
  Cpu, PlayCircle, RotateCcw,
} from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";

// Display metadata for the four scored metrics. The bands themselves live in
// ml/imu_balance.py (REFERENCE) - these are only the labels/units shown here,
// so they must stay in step with that file.
const METRICS = [
  { key: "vibration_rms", label: "Vibration amplitude", unit: "m/s²" },
  { key: "jerk_rms", label: "Micro-motion (jerk)", unit: "m/s³" },
  { key: "sway_rms", label: "Rotational sway", unit: "°/s" },
  { key: "tremor_freq", label: "Dominant tremor band", unit: "Hz" },
];

const BAND_LABEL = { low: "Low risk", moderate: "Moderate risk", high: "High risk" };

const SIM_PRESETS = {
  low: {
    riskScore: 13, vibrationAmp: 0.06, jerk: 1.1, sway: 1.8,
    label: "Low tremor", band: "typical healthy",
  },
  moderate: {
    riskScore: 55, vibrationAmp: 0.14, jerk: 2.8, sway: 4.2,
    label: "Moderate tremor", band: "early risk flag",
  },
  high: {
    riskScore: 83, vibrationAmp: 0.24, jerk: 4.6, sway: 6.9,
    label: "High tremor", band: "instability flag",
  },
};

const NODE_META = {
  sensor1: {
    title: "Thigh IMU",
    sub: "3-axis IMU (x/y/z + gyro) on the thigh (upper leg)",
    short: "Thigh",
  },
  sensor2: {
    title: "Shank IMU",
    sub: "3-axis IMU (x/y/z + gyro) on the shank (lower leg)",
    short: "Shank",
  },
};

const POLL_MS = 1000;

export default function ImuStep({ initialData, onSave }) {
  const { t } = useT();
  const [mode, setMode] = useState(initialData?.mode || "live");
  const [simBand, setSimBand] = useState(initialData?.simBand || "moderate");
  const [manual, setManual] = useState(
    initialData?.manual || { vibrationAmp: "", jerk: "", sway: "", riskScore: "" },
  );
  const [capturing, setCapturing] = useState(false);

  // ---- live gateway state ----
  const [live, setLive] = useState(null);       // /api/imu status payload
  const [liveErr, setLiveErr] = useState(null); // { code, message }
  const [trial, setTrial] = useState(null);     // scored result
  const [trialErr, setTrialErr] = useState(null);
  const [trialing, setTrialing] = useState(false);
  const [holdLeft, setHoldLeft] = useState(0);
  const holdTimerRef = useRef(null);

  const resetLive = useCallback(() => {
    setTrial(null); setTrialErr(null); setHoldLeft(0);
  }, []);

  // Poll the gateway only while the live source is selected.
  useEffect(() => {
    if (mode !== "live") return undefined;
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/imu", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !body) {
          setLiveErr({ code: body?.error || "GATEWAY_UNAVAILABLE", message: body?.message || "" });
          setLive(null);
        } else {
          setLiveErr(null);
          setLive(body);
        }
      } catch {
        if (alive) { setLiveErr({ code: "GATEWAY_UNAVAILABLE", message: "" }); setLive(null); }
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [mode]);

  useEffect(() => () => {
    clearInterval(holdTimerRef.current);
  }, []);

  // Count the hold down so the operator knows when to stop moving.
  useEffect(() => {
    clearInterval(holdTimerRef.current);
    if (!holdLeft) return undefined;
    holdTimerRef.current = setInterval(() => {
      setHoldLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(holdTimerRef.current);
  }, [holdLeft]);

  function setManualField(k, v) { setManual((m) => ({ ...m, [k]: v })); }

  const nodes = live?.gateway?.imu || null;
  const buffered = live?.buffered || {};
  const ready = Boolean(live?.ready);
  const holdSeconds = live?.trialDurationS || 8;
  const isLive = mode === "live";

  async function startTrial() {
    setTrialing(true);
    setTrialErr(null);
    try {
      const res = await fetch("/api/imu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setTrialErr({
          code: body?.error || "TRIAL_FAILED",
          message: body?.message || "Could not score the capture.",
        });
        return;
      }
      setTrial(body);
    } catch {
      setTrialErr({ code: "GATEWAY_UNAVAILABLE", message: "" });
    } finally {
      setTrialing(false);
      setHoldLeft(0);
    }
  }

  function handleSave() {
    if (isLive && trial) {
      onSave({
        mode,
        vibrationAmp: trial.mean.vibration_rms,
        jerk: trial.mean.jerk_rms,
        sway: trial.mean.sway_rms,
        riskScore: trial.risk_100,
        trial: {
          source: trial.source,
          band: trial.band,
          durationS: trial.duration_s,
          sensorsPresent: trial.sensorsPresent,
          sensors: trial.sensors,
          explanation: trial.explanation,
        },
      });
    } else if (mode === "simulated") {
      onSave({ mode, ...SIM_PRESETS[simBand], simBand });
    } else {
      onSave({
        mode,
        vibrationAmp: Number(manual.vibrationAmp) || 0,
        jerk: Number(manual.jerk) || 0,
        sway: Number(manual.sway) || 0,
        riskScore: Number(manual.riskScore) || 0,
      });
    }
  }

  const canSave = (isLive && trial) || mode === "simulated" || (mode === "manual" && manual.riskScore !== "");
  const previewAmp = mode === "simulated" ? SIM_PRESETS[simBand].vibrationAmp : Number(manual.vibrationAmp) || 0.08;
  const previewJerk = mode === "simulated" ? SIM_PRESETS[simBand].jerk : Number(manual.jerk) || 1.5;

  return (
    <StepFrame
      icon={Activity}
      title={t("steps.imuTitle")}
      subtitle={t("steps.imuSubtitle")}
      reference="Krecisz & Baczkowicz, Medical & Biological Engineering & Computing, 2018"
    >
      {/* ---------- How to run the trial ---------- */}
      <ol className="mb-5 space-y-2">
        {[
          <>Attach one IMU to the <strong>thigh</strong> and one to the <strong>shank</strong> of the same leg (each reports 3-axis x/y/z acceleration + gyro).</>,
          <>Ask the patient to stand still with feet shoulder-width apart, arms relaxed.</>,
          <>The patient balances quietly for about <strong>{holdSeconds} seconds</strong> — no talking, no deliberate movement.</>,
          <>The leg micro-vibration (x, y, z axes) and sway are captured and compared with a normal-person reference band.</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-slate-200/70 bg-white/40 px-3 py-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-clinical-100 text-[11px] font-bold text-clinical-700">
              {i + 1}
            </span>
            <span className="text-[13px] leading-snug text-slate-600">{step}</span>
          </li>
        ))}
      </ol>

      {/* ---------- Data-source note: swaps with the selected source ---------- */}
      {isLive ? (
        <Note tone="live" icon={Radio}>
          <strong>Live sensors</strong> — the sensor gateway streams real leg IMU frames into the
          server. The record will be labelled LIVE sensors.
        </Note>
      ) : mode === "simulated" ? (
        <Note tone="sim" icon={Sparkles}>
          <strong>Simulation mode</strong> — the next trial uses generated data so the full screening
          flow and report can be tested. The record will be labelled SIMULATED.
        </Note>
      ) : (
        <Note tone="sim" icon={PenLine}>
          <strong>Manual entry</strong> — no sensors used. Type the four values directly; the
          record is marked as manual in the report.
        </Note>
      )}

      {/* ---------- Data source ---------- */}
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Data source
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="IMU data source">
          <SourceChip icon={Radio} title="Live sensors" sub="sensor gateway" active={isLive}
            onClick={() => { setMode("live"); resetLive(); }} />
          <SourceChip icon={Sparkles} title="Simulated" sub="generated trial" active={mode === "simulated"}
            onClick={() => setMode("simulated")} />
          <SourceChip icon={PenLine} title="Manual entry" sub="typed values" active={mode === "manual"}
            onClick={() => setMode("manual")} />
        </div>
      </div>

      {/* ---------- Simulated scenario ---------- */}
      {mode === "simulated" && (
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Simulated trial scenario
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Simulated trial scenario">
            {Object.entries(SIM_PRESETS).map(([key, preset]) => (
              <SourceChip key={key} title={preset.label} sub={preset.band} active={simBand === key}
                onClick={() => setSimBand(key)} />
            ))}
          </div>
        </div>
      )}

      {/* ---------- Live sensor nodes ---------- */}
      {isLive && (
        <>
          {liveErr && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Sensor gateway not reachable</p>
                  <p className="mt-1 text-amber-700">
                    {liveErr.message || "Start the Python service with: npm run ml:serve"}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {NODE_KEYS.map((key) => (
              <SensorCard key={key} node={nodes?.[key]} meta={NODE_META[key]} loading={!nodes && !liveErr} />
            ))}
          </div>

          {/* Live status strip */}
          {live && (
            <div className="rounded-xl border border-slate-200/70 bg-white/40 px-4 py-3 mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Gateway
                </span>
                <span className="text-[11px] text-slate-400">
                  {live.gatewayStarted ? "running" : "stopped"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Buffered frames — thigh {buffered.sensor1 ?? 0}, shank {buffered.sensor2 ?? 0}{" "}
                (need {live.minFrames} from either IMU to score).
              </p>
              {live.firmwareTarget && (
                <p className="text-[11px] text-slate-400 mt-1">{live.firmwareTarget}</p>
              )}
            </div>
          )}

          {/* Trial control */}
          <div className="rounded-xl border border-slate-200/70 bg-white/40 p-4 mb-3">
            <button
              className="btn-secondary w-full"
              disabled={!ready || trialing || holdLeft > 0}
              onClick={() => { setHoldLeft(holdSeconds); setTrial(null); setTrialErr(null); }}
            >
              <PlayCircle size={15} />
              {holdLeft > 0 ? `Holding… ${holdLeft}s` : `Start ${holdSeconds}s trial`}
            </button>
            {!ready && !liveErr && (
              <p className="text-xs text-amber-600 mt-3">
                No usable frames buffered yet. Confirm both nodes show ONLINE above, then wait a moment.
              </p>
            )}
            {holdLeft > 0 && (
              <p className="text-xs text-slate-500 mt-3 text-center">
                Keep the patient still — scoring unlocks when the hold finishes.
              </p>
            )}
            {holdLeft === 0 && ready && !trialing && (
              <button className="btn-primary w-full mt-2" onClick={startTrial}>
                <Activity size={15} /> Score the last {holdSeconds}s
              </button>
            )}
          </div>
        </>
      )}

      {/* ---------- Manual / simulated preview signal ---------- */}
      {(mode === "simulated" || mode === "manual") && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Vibration signal monitor
            </span>
            <span className="text-[11px] text-slate-400">
              {capturing ? "capturing…" : "synthetic preview — idle"}
            </span>
          </div>
          <VibrationMonitor amplitude={previewAmp} jerk={previewJerk} active={capturing}
            durationMs={4000} onComplete={() => setCapturing(false)} color="#2dd4bf" />
          <button className="btn-secondary w-full mt-2 !py-2 text-xs" disabled={capturing}
            onClick={() => setCapturing(true)}>
            <PlayCircle size={14} /> {capturing ? "Recording 4s trial…" : "Run capture"}
          </button>
        </div>
      )}

      {mode === "manual" && (
        <div className="grid grid-cols-2 gap-4 mb-5">
          <Field label="Vibration amplitude (m/s²)" value={manual.vibrationAmp}
            onChange={(v) => setManualField("vibrationAmp", v)} />
          <Field label="Jerk (m/s³)" value={manual.jerk} onChange={(v) => setManualField("jerk", v)} />
          <Field label="Rotational sway (°/s)" value={manual.sway} onChange={(v) => setManualField("sway", v)} />
          <Field label="Overall risk score (0-100)" value={manual.riskScore}
            onChange={(v) => setManualField("riskScore", v)} />
        </div>
      )}

      {trialErr && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-3">
          <p className="font-semibold">
            {trialErr.code === "NOT_ENOUGH_DATA" ? "Not enough data" : "Trial failed"}
          </p>
          <p className="mt-1 text-amber-700">{trialErr.message}</p>
        </div>
      )}

      {/* ---------- Scored trial ---------- */}
      {trial && (
        <div className="mb-5">
          <div className="rounded-2xl border border-clinical-200 bg-clinical-50/40 p-4 mb-3">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className={`badge-${trial.band}`}>{BAND_LABEL[trial.band] || trial.band}</span>
              <span className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-800 tabular-nums">{trial.risk_100}</span>
                <span className="text-base font-medium text-slate-500">/100</span>
              </span>
              <span className="text-[10px] uppercase tracking-wide text-slate-400 ml-auto">
                vibration-instability score
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`badge-${trial.source === "live" ? "low" : "moderate"}`}>
                {trial.source === "live" ? "LIVE sensors" : "SIMULATED"}
              </span>
              <span className="text-[11px] text-slate-500">
                Hold {Math.round(trial.duration_s || holdSeconds)}s ·{" "}
                {trial.sensorsPresent?.length === 2
                  ? "both IMUs"
                  : `only ${(trial.sensorsPresent || []).map((s) => NODE_META[s]?.short || s).join(" + ")}`}
              </span>
            </div>

            <VibrationMonitor series={trial.series?.sensor1 || trial.series?.sensor2 || null} color="#0d9488" />
            <p className="text-[11px] text-slate-500 mt-1 mb-3">
              Band-passed acceleration magnitude, thigh IMU
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {(trial.sensorsPresent || []).map((k) => {
              const m = trial.sensors?.[k];
              if (!m) return null;
              return (
                <div key={k} className="rounded-xl border border-slate-200/70 bg-white/50 p-3">
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    {NODE_META[k]?.title || k}
                  </div>
                  <div className="space-y-1.5">
                    {METRICS.map((meta) => (
                      <div key={meta.key} className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] text-slate-500">{meta.label}</span>
                        <span className="text-sm font-semibold text-slate-800 tabular-nums">
                          {typeof m[meta.key] === "number" ? m[meta.key].toFixed(2) : "—"}
                          <span className="ml-1 text-[10px] font-normal text-slate-400">{meta.unit}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {m.vibration_axis && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                        Axis vibration (x/y/z RMS, m/s²)
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {["x", "y", "z"].map((ax) => (
                          <div key={ax} className="rounded-md bg-white/70 border border-slate-200/60 px-2 py-1 text-center">
                            <span className="text-[10px] uppercase text-slate-400">{ax}</span>{" "}
                            <b className="text-[11px] text-slate-700 tabular-nums">
                              {Number(m.vibration_axis[ax] ?? 0).toFixed(2)}
                            </b>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {Array.isArray(trial.explanation) && trial.explanation.length > 0 && (
            <div className="rounded-xl border border-slate-200/70 bg-white/40 p-4 mb-3 space-y-2">
              {trial.explanation.map((para, i) => (
                <p key={i} className="text-[12px] leading-relaxed text-slate-600">{para}</p>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-400">
            Screening estimate, not a diagnosis. Preview cutoffs are preliminary and must be
            recalibrated against real recordings.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        {trial && (
          <button className="btn-secondary flex-1" onClick={resetLive}>
            <RotateCcw size={15} /> Run another trial
          </button>
        )}
        <button className="btn-primary flex-1" disabled={!canSave} onClick={handleSave}>
          <CheckCircle2 size={16} />
          {trial ? "Record result" : t("common.save")}
        </button>
      </div>
    </StepFrame>
  );
}

const NODE_KEYS = ["sensor1", "sensor2"];

/**
 * Per-node live card. A retained frame from a node that has gone quiet is dimmed
 * and labelled with its age, because a struck-through-but-plausible number next
 * to an ONLINE/WAITING badge is exactly what leads to accepting a reading that
 * stopped minutes ago.
 */
function SensorCard({ node, meta, loading }) {
  const a = node?.last?.a;
  const g = node?.last?.g;
  const hasValues = !!(a && g);
  const stale = !!node && !node.online && node.stale !== false && hasValues;
  const dot = node?.online ? "bg-emerald-500" : stale ? "bg-amber-500" : "bg-slate-300";

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/50 p-3">
      <div className="flex items-start gap-2 mb-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Cpu size={13} className="text-slate-400" />
            {meta.title}
          </div>
          <div className="text-[11px] text-slate-500 leading-tight">{meta.sub}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {node ? `${node.device} · UDP ${node.port}` : "UDP " + (node?.port ?? (meta.short === "Thigh" ? 5005 : 5006))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className={`badge-${node?.online ? "low" : "moderate"}`}>
          {loading ? "…" : node?.online ? "ONLINE" : "WAITING"}
        </span>
        {node && (
          <span className="text-[10px] text-slate-400 tabular-nums">
            {node.frames} frames{node.age_s != null ? ` · ${node.age_s}s ago` : ""}
          </span>
        )}
      </div>

      {hasValues ? (
        <div className={`text-[11px] font-mono leading-tight rounded-lg bg-slate-950 px-2 py-1.5 ${
          stale ? "text-slate-400 line-through decoration-slate-600" : "text-slate-300"}`}>
          <div>acc {a.map((v) => v.toFixed(2).padStart(7)).join(" ")}</div>
          <div>gyr {g.map((v) => v.toFixed(1).padStart(7)).join(" ")}</div>
          {stale && (
            <p className="mt-1 font-sans text-[10px] text-amber-400 no-underline">
              stale — last packet {node.age_s}s ago, not a live reading
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">
          {loading ? "waiting for the gateway…" : "waiting for first packet"}
        </p>
      )}
    </div>
  );
}

function Note({ tone, icon: Icon, children }) {
  const live = tone === "live";
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 mb-5 text-[12px] leading-snug ${
      live ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function SourceChip({ icon: Icon, title, sub, active, onClick }) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-clinical-400 bg-clinical-50/70 text-clinical-700"
          : "border-slate-200/70 bg-white/40 text-slate-500 hover:bg-white/70"}`}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {Icon && <Icon size={14} />} {title}
      </span>
      {sub && <span className="block text-[11px] opacity-70 mt-0.5">{sub}</span>}
    </button>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" step="0.01" value={value}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
