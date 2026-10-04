"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import AppShell, { PageHeader } from "@/components/AppShell";
import { getPatient, listScreeningsForPatient, createScreening } from "@/lib/db";
import { User, Play, FileText, ChevronRight, Calendar, ClipboardList, Ruler } from "lucide-react";
import { useMemo } from "react";
import { computeBMI, bodySurfaceAreaM2 } from "@/lib/bmi";

const BMI_TONE = {
  "Underweight": "text-sky-700 bg-sky-50 border-sky-200",
  "Normal weight": "text-emerald-700 bg-emerald-50 border-emerald-200",
  Overweight: "text-amber-700 bg-amber-50 border-amber-200",
  "Obese (class I)": "text-orange-700 bg-orange-50 border-orange-200",
  "Obese (class II)": "text-rose-700 bg-rose-50 border-rose-200",
  "Obese (class III)": "text-red-800 bg-red-50 border-red-200",
};
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useT } from "@/lib/i18n/LanguageContext";

export default function PatientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useT();
  const [patient, setPatient] = useState(null);
  const [screenings, setScreenings] = useState([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getPatient(id).then(setPatient);
    listScreeningsForPatient(id).then(setScreenings);
  }, [id]);

  async function startNewScreening() {
    setStarting(true);
    const s = await createScreening(id);
    router.push(`/screening/${s.id}`);
  }

  const trendData = screenings
    .filter((s) => s.status === "completed" && s.combinedScore != null)
    .slice().reverse()
    .map((s) => ({ date: new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }), score: s.combinedScore }));

  const anthro = useMemo(() => {
    if (!patient) return null;
    const r = computeBMI(patient.heightCm, patient.weightKg);
    if (r.bmi == null) return null;
    return {
      heightCm: patient.heightCm,
      weightKg: patient.weightKg,
      bmi: r.bmi,
      bmiLabel: r.classification.primary.label,
      bmiLabelWhoStandard: r.classification.alsoKnownAs.label,
      bmiSystem: "WHO Asian-Indian",
      bsa: bodySurfaceAreaM2(patient.heightCm, patient.weightKg),
    };
  }, [patient]);

  if (!patient) return null;

  return (
    <AuthGuard>
      <AppShell>
        <div className="p-5 sm:p-8 max-w-[1600px] mx-auto">
          <PageHeader
            icon={User} title={patient.name}
            subtitle={`${patient.patientCode}  |  ${patient.age}y  |  ${patient.sex}${patient.village ? "  |  " + patient.village : ""}`}
            action={<button onClick={startNewScreening} disabled={starting} className="btn-primary"><Play size={16} /> {starting ? "Starting..." : t("patients.startScreening")}</button>}
          />

          {anthro && anthro.bmi != null && (
            <div className="card mb-6">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Ruler size={14} className="text-clinical-600" /> Anthropometrics
                </div>
                <div className="text-sm text-slate-600">
                  Height <strong className="text-slate-800">{anthro.heightCm} cm</strong>
                </div>
                <div className="text-sm text-slate-600">
                  Weight <strong className="text-slate-800">{anthro.weightKg} kg</strong>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  BMI{" "}
                  <strong className="text-slate-800 tabular-nums">{anthro.bmi.toFixed(1)}</strong>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${BMI_TONE[anthro.bmiLabel] || "text-slate-600 bg-slate-50 border-slate-200"}`}>
                    {anthro.bmiLabel}
                  </span>
                </div>
                <div className="text-sm text-slate-600">
                  BSA <strong className="text-slate-800 tabular-nums">{anthro.bsa} m^2</strong>
                </div>
                <div className="text-[11px] text-slate-400 w-full lg:w-auto">
                  {anthro.bmiSystem} cut-offs (WHO standard would read {anthro.bmiLabelWhoStandard})
                </div>
              </div>
            </div>
          )}

          {trendData.length > 1 && (
            <div className="card mb-6">
              <h3 className="font-semibold text-slate-800 mb-4">{t("patients.trend")}</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="card !p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/60 flex items-center gap-2">
              <Calendar size={16} className="text-clinical-600" />
              <h3 className="font-semibold text-slate-800">{t("patients.history")}</h3>
            </div>
            {screenings.length === 0 ? (
              <div className="text-center py-14">
                <ClipboardList size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">{t("patients.noHistory")}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/60">
                {screenings.map((s) => (
                  <Link key={s.id} href={s.status === "completed" ? `/report/${s.id}` : `/screening/${s.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-white/50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center">
                        <FileText size={16} className="text-slate-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {new Date(s.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                        </div>
                        <div className="text-xs text-slate-400">{s.status === "completed" ? `Combined score: ${s.combinedScore ?? "-"}` : "In progress"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.status === "completed" ? (
                        <span className={`badge-${(s.resultBand || "neutral").toLowerCase()}`}>{s.resultBand}</span>
                      ) : (
                        <span className="badge-neutral">Continue</span>
                      )}
                      <ChevronRight size={16} className="text-slate-300" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
