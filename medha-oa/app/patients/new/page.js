"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import AppShell, { PageHeader } from "@/components/AppShell";
import { createPatient } from "@/lib/db";
import { UserPlus, Ruler, Weight, Check } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";
import { computeBMI, isValidHeight, isValidWeight, HEIGHT_CM_MIN, HEIGHT_CM_MAX, WEIGHT_KG_MIN, WEIGHT_KG_MAX } from "@/lib/bmi";

export default function NewPatientPage() {
  const router = useRouter();
  const { t } = useT();
  const [form, setForm] = useState({ name: "", age: "", sex: "Female", phone: "", village: "", heightCm: "", weightKg: "" });
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function blur(k) { setTouched((t2) => ({ ...t2, [k]: true })); }

  // Height and weight are compulsory: BMI and the weight-bearing load framing
  // in the report cannot be produced without them, so a record missing either
  // would silently produce a report with a hole in it.
  const heightOk = isValidHeight(form.heightCm);
  const weightOk = isValidWeight(form.weightKg);
  const bmi = heightOk && weightOk ? computeBMI(form.heightCm, form.weightKg) : null;

  const heightError = touched.heightCm && !heightOk
    ? `Enter height in cm (${HEIGHT_CM_MIN}-${HEIGHT_CM_MAX}).`
    : null;
  const weightError = touched.weightKg && !weightOk
    ? `Enter weight in kg (${WEIGHT_KG_MIN}-${WEIGHT_KG_MAX}).`
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!heightOk || !weightOk) {
      setTouched({ heightCm: true, weightKg: true });
      return;
    }
    setSaving(true);
    const patient = await createPatient({
      name: form.name, age: Number(form.age), sex: form.sex, phone: form.phone, village: form.village,
      heightCm: Number(form.heightCm), weightKg: Number(form.weightKg),
    });
    router.replace(`/patients/${patient.id}`);
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="p-5 sm:p-8 max-w-3xl mx-auto">
          <PageHeader icon={UserPlus} title={t("patients.registerTitle")} subtitle={t("patients.registerSubtitle")} />

          <form onSubmit={handleSubmit} className="card space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">{t("patients.name")}</label>
                <input className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <label className="label">{t("patients.age")}</label>
                <input className="input" type="number" required min="1" max="120" value={form.age} onChange={(e) => set("age", e.target.value)} />
              </div>
              <div>
                <label className="label">{t("patients.sex")}</label>
                <select className="input" value={form.sex} onChange={(e) => set("sex", e.target.value)}>
                  <option>Female</option><option>Male</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="label">{t("patients.phone")}</label>
                <input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <label className="label">{t("patients.village")}</label>
                <input className="input" value={form.village} onChange={(e) => set("village", e.target.value)} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Ruler size={15} className="text-clinical-600" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Anthropometrics (required)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label flex items-center justify-between">
                    <span>{t("patients.height")} (cm) *</span>
                    {heightOk && form.heightCm !== "" && <Check size={14} className="text-emerald-600" />}
                  </label>
                  <input
                    className={`input ${heightError ? "border-red-400" : ""}`}
                    type="number" inputMode="decimal" step="0.1"
                    min={HEIGHT_CM_MIN} max={HEIGHT_CM_MAX}
                    required
                    value={form.heightCm}
                    onBlur={() => blur("heightCm")}
                    onChange={(e) => set("heightCm", e.target.value)}
                  />
                  {heightError && <p className="text-[11px] text-red-600 mt-1">{heightError}</p>}
                </div>
                <div>
                  <label className="label flex items-center justify-between">
                    <span>{t("patients.weight")} (kg) *</span>
                    {weightOk && form.weightKg !== "" && <Check size={14} className="text-emerald-600" />}
                  </label>
                  <input
                    className={`input ${weightError ? "border-red-400" : ""}`}
                    type="number" inputMode="decimal" step="0.1"
                    min={WEIGHT_KG_MIN} max={WEIGHT_KG_MAX}
                    required
                    value={form.weightKg}
                    onBlur={() => blur("weightKg")}
                    onChange={(e) => set("weightKg", e.target.value)}
                  />
                  {weightError && <p className="text-[11px] text-red-600 mt-1">{weightError}</p>}
                </div>
              </div>

              {bmi?.bmi != null && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white border border-slate-200/70 px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <Weight size={14} className="text-clinical-600" />
                    BMI {bmi.bmi.toFixed(1)}
                  </span>
                  <span className="text-xs text-slate-600">{bmi.classification.primary.label}</span>
                  <span className="text-[11px] text-slate-400">
                    Asian-Indian cut-off (also {bmi.classification.alsoKnownAs.label} by WHO standard)
                  </span>
                </div>
              )}
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? "Saving…" : t("patients.registerBtn")}
            </button>
          </form>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
