"use client";

import StepFrame from "./StepFrame";
import { computeFusion } from "@/lib/fusion";
import { computeBMI } from "@/lib/bmi";
import { CheckCircle2, FileCheck, ScanLine, Video, Activity, ClipboardList, Hand, AlertTriangle, BarChart3, Ruler } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";

const DOMAIN_META = {
  structural: { label: "Structural (X-ray)", icon: ScanLine },
  functional: { label: "Functional (Camera/SPPB)", icon: Video },
  biomechanical: { label: "Biomechanical (IMU)", icon: Activity },
  contextual: { label: "Contextual (WOMAC/FIHOA)", icon: ClipboardList },
  handOA: { label: "Hand-OA (Visual + Grip)", icon: Hand },
};

export default function ReviewStep({ steps, patient, onFinalize, finalizing }) {
  const { t } = useT();
  const fusion = computeFusion(steps);
  const bmi = patient ? computeBMI(patient.heightCm, patient.weightKg) : null;

  const radarData = Object.entries(fusion.domainScores)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({ domain: DOMAIN_META[k].label.split(" ")[0], score: v }));

  return (
    <StepFrame icon={BarChart3} title={t("steps.reviewTitle")} subtitle={t("steps.reviewSubtitle")}>
      {fusion.combinedScore == null ? (
        <p className="text-sm text-slate-500 mb-5">Complete at least one test to compute a risk score.</p>
      ) : (
        <>
          <div className="rounded-2xl text-white p-6 mb-5 text-center" style={{ background: "linear-gradient(135deg,#075985,#0f766e)" }}>
            <div className="text-xs uppercase tracking-wide text-clinical-200 mb-1">Combined OA Risk Score</div>
            <div className="text-5xl font-bold mb-2">{fusion.combinedScore}</div>
            <span className="badge !bg-white/20 !text-white">{fusion.band.label} Risk</span>
            <p className="text-xs text-clinical-100 mt-3">
              {fusion.xrayAvailable ? "Weighting includes X-ray (structural) evidence." : "X-ray unavailable — weights rebalanced across remaining tests."}
            </p>
          </div>

          {bmi?.bmi != null && (
            <div className="rounded-2xl border border-slate-200/70 bg-white/50 px-5 py-3 mb-5 flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Ruler size={14} className="text-clinical-600" /> Body mass index
              </span>
              <span className="text-sm text-slate-600">
                <strong className="text-xl text-slate-800 tabular-nums">{bmi.bmi.toFixed(1)}</strong>{" "}
                <span className="text-xs text-slate-500">kg/m² — {bmi.classification.primary.label} (WHO Asian-Indian cut-offs)</span>
              </span>
              <span className="text-[11px] text-slate-400 w-full sm:w-auto">
                {patient.heightCm} cm · {patient.weightKg} kg · WHO standard: {bmi.classification.alsoKnownAs.label}
              </span>
            </div>
          )}

          {radarData.length >= 3 && (
            <div className="rounded-2xl border border-slate-200/70 bg-white/50 p-3 mb-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: "#475569" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="score" stroke="#0d9488" fill="#0d9488" fillOpacity={0.35} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="space-y-2 mb-5">
            {Object.entries(fusion.contributions).map(([domain, c]) => {
              const Meta = DOMAIN_META[domain];
              return (
                <div key={domain} className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/40 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Meta.icon size={15} className="text-clinical-600" /> {Meta.label}
                  </div>
                  {c ? (
                    <div className="text-sm text-slate-500">score <span className="font-semibold text-slate-800">{c.score}</span> × {Math.round(c.weight * 100)}%</div>
                  ) : (
                    <span className="text-xs text-slate-400">Not completed</span>
                  )}
                </div>
              );
            })}
          </div>

          {fusion.mismatchFlag?.triggered && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-5 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> Structural–Functional Mismatch: {fusion.mismatchFlag.detail}
            </div>
          )}

          <p className="text-[11px] text-slate-400 mb-5">
            Screening triage aid only — not a diagnosis. Weights and thresholds are engineering starting points (TBV) pending clinical validation.
          </p>
        </>
      )}

      <button className="btn-primary w-full" disabled={fusion.combinedScore == null || finalizing} onClick={() => onFinalize(fusion)}>
        <FileCheck size={16} /> {finalizing ? "Finalizing…" : "Finalize & Generate Report"}
      </button>
    </StepFrame>
  );
}
