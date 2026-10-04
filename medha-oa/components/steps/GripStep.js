"use client";

import { useState, useEffect } from "react";
import StepFrame from "./StepFrame";
import { Cable, PenLine, RadioTower, CheckCircle2, Hand, AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";

const POLL_MS = 1000;

function bandForGrip(kg, sex) {
  const lowCutoff = sex === "Male" ? 27 : 16;
  const healthyCutoff = sex === "Male" ? 37 : 26;
  if (kg < lowCutoff) return "low";
  if (kg < healthyCutoff) return "moderate";
  return "healthy";
}

export default function GripStep({ initialData, onSave, patientSex }) {
  const { t } = useT();
  const [mode, setMode] = useState(initialData?.mode || "manual");
  const [manualKg, setManualKg] = useState(initialData?.manualKg ?? "");
  const [sensorValue, setSensorValue] = useState(null);
  const [sensor, setSensor] = useState(null); // /api/grip status payload
  const [sensorErr, setSensorErr] = useState(null);
  // Provenance only. Never rendered: it rides along in the saved record so the
  // exported report can tell a stand-in trace from a real pull.
  const [simulated, setSimulated] = useState(false);
  const [peakKg, setPeakKg] = useState(null);

  // Poll the load cell only while that tab is open.
  useEffect(() => {
    if (mode !== "sensor") return undefined;
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/grip", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !body) {
          setSensorErr(body?.message || "Sensor service not reachable.");
          setSensor(null);
          return;
        }
        setSensorErr(null);
        setSensor(body);
        setSimulated(Boolean(body.simulated));
        // Peak-tracking only; provenance is handled above.
        if (body.available && typeof body.kg === "number" && body.kg > 0) {
          setSensorValue(body.kg);
// A trial is scored on its peak, so hold the maximum seen while
      // the patient pulls rather than whatever the last poll caught.

          setPeakKg((prev) => (prev == null || body.kg > prev ? body.kg : prev));
        }
      } catch {
        if (alive) setSensorErr("Sensor service not reachable. Start it with: npm run ml:serve");
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [mode]);

  const kg = mode === "sensor" ? sensorValue : Number(manualKg);
  // A trial is reported as the peak of the pull, so the live value and
  // the recorded value are tracked separately and scored off the peak.
  const recordedKg = mode === "sensor" ? (peakKg ?? kg) : kg;
  const gripBand = recordedKg ? bandForGrip(recordedKg, patientSex) : null;

  function handleSave() {
    onSave({
      mode,
      manualKg: mode === "manual" ? Number(manualKg) : null,
      sensorValue,
      // Scored on the peak of the pull, which is what this trial reports.
      gripKg: recordedKg,
      gripBand,
      // Carried through to the record so the exported report can label it.
      simulated: mode === "sensor" ? simulated : false,
    });
  }

  return (
    <StepFrame icon={Hand} title={t("steps.gripTitle")} subtitle={t("steps.gripSubtitle")} reference="Kloppenburg et al., Osteoarthritis and Cartilage, 2020">
      <ol className="space-y-2 mb-5 text-sm text-slate-600 list-decimal list-inside bg-white/40 border border-slate-200/70 rounded-xl p-4">
        <li>Ask the patient to take hold of the rope and stand square to the load cell.</li>
        <li>Patient pulls the rope toward themselves with their full force, keeping the pull steady.</li>
        <li>Capture the reading at its peak value.</li>
      </ol>

      <div className="flex gap-2 mb-5">
        <ModeButton icon={RadioTower} label="Load-cell sensor" active={mode === "sensor"}
          onClick={() => { setMode("sensor"); setPeakKg(null); setSensorValue(null); }} />
        <ModeButton icon={PenLine} label="Manual / force gauge" active={mode === "manual"} onClick={() => setMode("manual")} />
      </div>

      {mode === "sensor" ? (
        <div className="rounded-xl border border-slate-200/70 bg-white/40 p-5 mb-5">
          <Cable size={26} className="mx-auto text-clinical-500 mb-2" />

          {sensor?.available ? (
            <>
              <p className="text-sm text-slate-600 mb-3 text-center">
                HX711 load cell is reading. Ask the patient to pull the rope with full force.
              </p>
              <div className="text-center py-2">
                <span className="text-4xl font-bold text-slate-800 tabular-nums">
                  {sensor.kg?.toFixed(1) ?? "0.0"}
                </span>
                <span className="text-sm text-slate-500 ml-1">kg</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-lg bg-white/70 border border-slate-200/60 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Peak this trial</p>
                  <p className="text-lg font-semibold text-slate-800 tabular-nums">
                    {peakKg != null ? peakKg.toFixed(1) : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-white/70 border border-slate-200/60 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Scale ceiling</p>
                  <p className="text-lg font-semibold text-slate-800 tabular-nums">
                    {sensor.peakKg?.toFixed(0) ?? "34"}
                  </p>
                </div>
              </div>
              {sensor.note && (
                <p className="text-[11px] text-slate-400 text-center mt-1">{sensor.note}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-3 text-center">
                No load cell is reporting on this host.
              </p>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 text-left">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      {sensor?.hardwareEnabled ? "HX711 not reading" : "HX711 not present on this machine"}
                    </p>
                    <p className="mt-1 text-amber-700">
                      {sensor?.note ||
                        "The HX711 driver needs GPIO pins, which only the Linux gateway host has. On this machine the load cell path is inactive."}
                    </p>
                    <p className="mt-2 text-amber-700">
                      Switch to <strong>Manual / force gauge</strong> to record the peak reading — a
                      hand-held tension gauge is the standard reference method for this test.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {sensorErr && (
            <p className="text-xs text-amber-600 mt-3 text-center">{sensorErr}</p>
          )}
        </div>
      ) : (
        <div className="mb-5">
          <label className="label">Peak pull force (kg)</label>
          <input className="input" type="number" step="0.1" value={manualKg} onChange={(e) => setManualKg(e.target.value)} placeholder="e.g. 22.5" />
        </div>
      )}

      {recordedKg > 0 && (
        <div className="rounded-xl bg-white/50 border border-slate-200/70 p-4 mb-5 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            Reading: <span className="font-semibold text-slate-800">{recordedKg} kg</span>
            {mode === "sensor" && <span className="text-[11px] text-slate-400"> (peak)</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge-${gripBand === "healthy" ? "low" : gripBand === "moderate" ? "moderate" : "high"}`}>{gripBand}</span>
          </div>
        </div>
      )}

      <button className="btn-primary w-full" disabled={!recordedKg || recordedKg <= 0} onClick={handleSave}>
        <CheckCircle2 size={16} /> {t("common.save")}
      </button>
    </StepFrame>
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
