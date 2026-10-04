"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import AppShell from "@/components/AppShell";
import { getScreening, getPatient, getAllSteps } from "@/lib/db";
import { computeFusion } from "@/lib/fusion";
import { buildReportModel } from "@/lib/reportModel";
import { useT } from "@/lib/i18n/LanguageContext";
import {
  Printer, ArrowLeft, FileText, Stethoscope, Bone, Activity, Salad,
  AlertTriangle, ScanLine, Video, ClipboardList, Hand, Download, Ruler,
  Info as InfoIcon, CircleDashed, Loader2,
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const DOMAIN_META = {
  structural: { label: "Structural", icon: ScanLine },
  functional: { label: "Functional", icon: Video },
  biomechanical: { label: "Biomechanical", icon: Activity },
  contextual: { label: "Contextual", icon: ClipboardList },
  handOA: { label: "Hand-OA", icon: Hand },
};

const BAND_STYLE = {
  Low: "from-emerald-500 to-teal-600",
  Moderate: "from-amber-500 to-orange-600",
  High: "from-rose-500 to-red-700",
};

const BMI_TONE = {
  "Underweight": "text-sky-700 bg-sky-50 border-sky-200",
  "Normal weight": "text-emerald-700 bg-emerald-50 border-emerald-200",
  Overweight: "text-amber-700 bg-amber-50 border-amber-200",
  "Obese (class I)": "text-orange-700 bg-orange-50 border-orange-200",
  "Obese (class II)": "text-rose-700 bg-rose-50 border-rose-200",
  "Obese (class III)": "text-red-800 bg-red-50 border-red-200",
};

export default function ReportPage() {
  const { id } = useParams();
  const [screening, setScreening] = useState(null);
  const [patient, setPatient] = useState(null);
  const [fusion, setFusion] = useState(null);
  const [stepsRaw, setStepsRaw] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { t } = useT();

  const guidance = [
    { icon: Bone, title: t("report.joint"), text: t("report.jointText") },
    { icon: Activity, title: t("report.activity"), text: t("report.activityText") },
    { icon: Salad, title: t("report.nutrition"), text: t("report.nutritionText") },
    { icon: Stethoscope, title: t("report.doctor"), text: t("report.doctorText") },
  ];

  useEffect(() => {
    (async () => {
      const s = await getScreening(id);
      setScreening(s);
      if (s) {
        const p = await getPatient(s.patientId);
        setPatient(p);
        const steps = await getAllSteps(id);
        setStepsRaw(steps);
        setFusion(computeFusion(steps));
      }
    })();
  }, [id]);

  const model = useMemo(() => {
    if (!screening || !patient || !fusion) return null;
    return buildReportModel({ patient, screening, steps: stepsRaw || {}, fusion });
  }, [screening, patient, fusion, stepsRaw]);

  if (!screening || !patient || !fusion || !model) return null;

  const radarData = Object.entries(fusion.domainScores)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({ domain: DOMAIN_META[k].label, score: v }));

  const womacBars = stepsRaw?.womac?.scored
    ? [
        { name: "Pain", value: stepsRaw.womac.scored.painScore, max: 20 },
        { name: "Stiffness", value: stepsRaw.womac.scored.stiffnessScore, max: 8 },
        { name: "Function", value: stepsRaw.womac.scored.functionScore, max: 68 },
      ]
    : [];

  async function handleDownload() {
    setPdfBusy(true);
    try {
      // jsPDF + autotable are ~150 kB; load them only when a PDF is actually
      // requested so the report page itself stays light.
      const { downloadReportPdf } = await import("@/lib/reportPdf");
      downloadReportPdf(model, { clinician: "Screening operator" });
    } catch (err) {
      console.error("PDF generation failed", err);
      alert("Could not generate the PDF. Please use Print instead.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto print:p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5 print:hidden">
            <Link
              href={`/patients/${patient.id}`}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-clinical-600"
            >
              <ArrowLeft size={14} /> {t("report.back")} {patient.name}
            </Link>
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={() => window.print()}>
                <Printer size={16} /> {t("report.print")}
              </button>
              <button className="btn-primary" onClick={handleDownload} disabled={pdfBusy}>
                {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
              </button>
            </div>
          </div>

          <div className="card print:shadow-none print:border-none">
            {/* ------------------------------------------------ report header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/60 pb-5 mb-5">
              <div className="flex items-center gap-3">
                <div className="icon-tile !h-12 !w-12">
                  <Stethoscope size={24} />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-800">{t("report.title")}</h1>
                  <p className="text-xs text-slate-400">
                    {t("report.generated")} {new Date(screening.updatedAt).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">{model.meta.reportId}</p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div className="font-semibold text-slate-700">{model.meta.subtitle}</div>
                <div>Issued for clinical follow-up</div>
              </div>
            </div>

            {/* ------------------------------------------------ patient + anthropometrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6 text-sm">
              <Field label={t("report.patient")} value={model.patient.name} />
              <Field label={t("report.patientId")} value={model.patient.code} />
              <Field label={t("report.ageSex")} value={`${model.patient.age}y / ${model.patient.sex}`} />
              <Field
                label="Height"
                value={model.anthropometrics.heightCm != null ? `${model.anthropometrics.heightCm} cm` : "Not recorded"}
              />
              <Field
                label="Weight"
                value={model.anthropometrics.weightKg != null ? `${model.anthropometrics.weightKg} kg` : "Not recorded"}
              />
              <Field
                label="Body surface area"
                value={model.anthropometrics.bsa != null ? `${model.anthropometrics.bsa} m2` : "-"}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {/* BMI card */}
              <div className="rounded-2xl border border-slate-200/70 bg-white/50 p-4 flex flex-col">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  <Ruler size={14} className="text-clinical-600" /> Body mass index
                </div>
                {model.anthropometrics.bmi != null ? (
                  <>
                    <div className="flex items-end gap-2 mb-2">
                      <span className="text-4xl font-bold text-slate-800 tabular-nums">
                        {model.anthropometrics.bmi.toFixed(1)}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          BMI_TONE[model.anthropometrics.bmiLabel] || "text-slate-600 bg-slate-50 border-slate-200"
                        }`}
                      >
                        {model.anthropometrics.bmiLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Classified by <strong>{model.anthropometrics.bmiSystem}</strong> cut-offs. By WHO standard
                      cut-offs this patient would be classified as{" "}
                      <strong>{model.anthropometrics.bmiLabelWhoStandard}</strong>.
                    </p>
                    {model.anthropometrics.bmi >= 27.5 && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/70 rounded-lg px-2 py-1.5 mt-2">
                        Above the Asian-Indian obesity threshold. Excess body weight increases medial knee loading
                        and accelerates OA progression.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-400">
                    Height and weight are required to compute BMI. Edit the patient record to add them.
                  </p>
                )}
              </div>

              {/* Composite score */}
              <div
                className={`lg:col-span-2 rounded-2xl bg-gradient-to-br text-white p-5 flex flex-col justify-center ${
                  BAND_STYLE[model.impression.band?.label] || "from-slate-500 to-slate-600"
                }`}
              >
                <div className="flex items-center gap-6">
                  <div className="text-center shrink-0">
                    <div className="text-[11px] uppercase tracking-wide opacity-80 mb-1">Composite score</div>
                    <div className="text-5xl font-bold tabular-nums leading-none">
                      {model.impression.score != null ? model.impression.score : "-"}
                    </div>
                    <div className="text-[11px] opacity-80 mt-1">out of 100</div>
                  </div>
                  <div className="min-w-0">
                    <span className="badge !bg-white/20 !text-white mb-2">
                      {model.impression.band?.label} Risk
                    </span>
                    <p className="text-xs opacity-95 leading-relaxed">{model.impression.summary}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------ charts (screen only) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {radarData.length >= 3 && (
                <div className="rounded-2xl border border-slate-200/70 bg-white/50 p-3 h-64 print:hidden">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">
                    Domain profile
                  </div>
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
              {womacBars.length > 0 && (
                <div className="rounded-2xl border border-slate-200/70 bg-white/50 p-4 h-64 print:hidden">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    {t("report.womac")}
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={womacBars}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#0284c7" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {model.mismatch.triggered && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" /> Structural-Functional Mismatch:{" "}
                {model.mismatch.detail}
              </div>
            )}

            {/* ------------------------------------------------ domain table */}
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <FileText size={16} className="text-clinical-600" /> {t("report.findings")}
            </h3>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Domain</th>
                    <th className="py-2 pr-3 font-semibold hidden md:table-cell">Evidence source</th>
                    <th className="py-2 pr-3 font-semibold text-right">Score</th>
                    <th className="py-2 pr-3 font-semibold text-right hidden sm:table-cell">Weight</th>
                    <th className="py-2 font-semibold text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {model.domains.map((d) => {
                    const Meta = DOMAIN_META[d.key];
                    return (
                      <tr key={d.key} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-2 text-slate-700 font-medium">
                            <Meta.icon size={14} className="text-clinical-600 shrink-0" /> {Meta.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-400 hidden md:table-cell">{d.source}</td>
                        <td className="py-2.5 pr-3 text-right">
                          {d.score != null ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="h-1.5 w-16 rounded-full bg-slate-200/70 overflow-hidden inline-block align-middle">
                                <span
                                  className="block h-full rounded-full bg-clinical-600"
                                  style={{ width: `${d.score}%` }}
                                />
                              </span>
                              <span className="tabular-nums font-semibold text-slate-800">{d.score}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                              <CircleDashed size={12} /> {t("report.notCompleted")}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-xs text-slate-500 tabular-nums hidden sm:table-cell">
                          {Math.round(d.weight * 100)}%
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-slate-600">
                          {d.contribution != null ? d.contribution.toFixed(1) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ------------------------------------------------ measurements */}
            <h3 className="font-semibold text-slate-800 mb-3">Detailed measurements</h3>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Test</th>
                    <th className="py-2 pr-3 font-semibold">Result</th>
                    <th className="py-2 pr-3 font-semibold hidden md:table-cell">Detail</th>
                    <th className="py-2 font-semibold hidden lg:table-cell">Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {model.measurements.map((m, i) => {
                    const missing = /^(Not done|Incomplete)/i.test(String(m.value));
                    return (
                      <tr key={`${m.test}-${i}`} className="border-b border-slate-100 last:border-0 align-top">
                        <td className="py-2.5 pr-3 text-slate-700 font-medium">{m.test}</td>
                        <td
                          className={`py-2.5 pr-3 tabular-nums ${
                            missing ? "text-slate-400 italic" : "font-semibold text-slate-800"
                          }`}
                        >
                          {m.value ?? "-"}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-500 hidden md:table-cell">
                          {m.detail || "-"}
                        </td>
                        <td className="py-2.5 text-xs text-slate-500 hidden lg:table-cell">{m.note || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ------------------------------------------------ findings */}
            <h3 className="font-semibold text-slate-800 mb-3">Key findings</h3>
            <ul className="space-y-2 mb-6">
              {model.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  {f.severity === "major" ? (
                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-500" />
                  ) : (
                    <InfoIcon size={15} className="shrink-0 mt-0.5 text-amber-500" />
                  )}
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>

            {/* ------------------------------------------------ recommendations */}
            <h3 className="font-semibold text-slate-800 mb-3">Recommendations</h3>
            <div className="space-y-2 mb-6">
              {model.recommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-clinical-600 bg-clinical-50 rounded px-1.5 py-0.5 shrink-0 mt-0.5 min-w-[86px] text-center">
                    {r.who}
                  </span>
                  <span className="text-slate-600">{r.text}</span>
                </div>
              ))}
            </div>

            {/* ------------------------------------------------ guidance */}
            <h3 className="font-semibold text-slate-800 mb-3">{t("report.guidance")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
              {guidance.map((g) => (
                <div key={g.title} className="rounded-xl border border-slate-200/70 bg-white/40 p-3">
                  <div className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                    <g.icon size={14} className="text-clinical-600" /> {g.title}
                  </div>
                  <p className="text-xs text-slate-500">{g.text}</p>
                </div>
              ))}
            </div>

            {/* ------------------------------------------------ completeness */}
            {model.completeness.missing.length > 0 && (
              <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3 mb-6 text-xs text-slate-600">
                <div className="font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-500" />
                  Incomplete screening: {model.completeness.completed} of {model.completeness.total}{" "}
                  measurements recorded
                </div>
                <div>
                  Not completed: {model.completeness.missing.join(", ")}. Scores above cover only the tests that
                  were performed.
                </div>
              </div>
            )}

            {/* ------------------------------------------------ limitations */}
            <details className="rounded-xl border border-slate-200/70 bg-slate-50/50 px-4 py-3 mb-5">
              <summary className="text-xs font-semibold text-slate-600 cursor-pointer select-none">
                Method, limitations and how to read this report
              </summary>
              <ul className="mt-2 space-y-1.5">
                {model.limitations.map((l, i) => (
                  <li key={i} className="text-[11px] text-slate-500 leading-relaxed">
                    - {l}
                  </li>
                ))}
              </ul>
            </details>

            {/* ------------------------------------------------ signature */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 border-t border-slate-200/60 pt-6 mb-4">
              <div>
                <div className="h-8 border-b border-slate-300" />
                <div className="text-[11px] text-slate-500 mt-1">Screening operator signature</div>
              </div>
              <div>
                <div className="h-8 border-b border-slate-300" />
                <div className="text-[11px] text-slate-500 mt-1">Reviewing clinician signature and stamp</div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 border-t border-slate-200/60 pt-3">
              {t("report.disclaimer")} {model.footer}
            </p>
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-xl bg-white/50 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="font-medium text-slate-700">{value}</div>
    </div>
  );
}
