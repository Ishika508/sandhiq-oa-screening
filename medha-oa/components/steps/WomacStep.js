"use client";

import { useState, useMemo } from "react";
import StepFrame from "./StepFrame";
import { WOMAC_QUESTIONS, WOMAC_SCALE, scoreWOMAC } from "@/lib/womac";
import { Flame, Snowflake, Footprints, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";

const SECTION_META = {
  pain: { icon: Flame, key: "pain" },
  stiffness: { icon: Snowflake, key: "stiffness" },
  function: { icon: Footprints, key: "function" },
};

// Flattened ordered question list across all three sections, so the whole
// questionnaire runs as a single one-at-a-time sequence.
const FLAT = [
  ...WOMAC_QUESTIONS.pain.map((q, i) => ({ section: "pain", index: i, text: q })),
  ...WOMAC_QUESTIONS.stiffness.map((q, i) => ({ section: "stiffness", index: i, text: q })),
  ...WOMAC_QUESTIONS.function.map((q, i) => ({ section: "function", index: i, text: q })),
];

export default function WomacStep({ initialData, onSave }) {
  const { t, questionnaireFallback } = useT();
  const [answers, setAnswers] = useState(
    initialData?.answers || {
      pain: Array(WOMAC_QUESTIONS.pain.length).fill(null),
      stiffness: Array(WOMAC_QUESTIONS.stiffness.length).fill(null),
      function: Array(WOMAC_QUESTIONS.function.length).fill(null),
    }
  );
  const [cursor, setCursor] = useState(0);

  const current = FLAT[cursor];
  const currentValue = answers[current.section][current.index];
  const answeredCount = useMemo(
    () => Object.values(answers).flat().filter((v) => v != null).length,
    [answers]
  );
  const progressPct = Math.round((answeredCount / FLAT.length) * 100);

  function choose(value) {
    setAnswers((a) => {
      const copy = { ...a, [current.section]: [...a[current.section]] };
      copy[current.section][current.index] = value;
      return copy;
    });
    if (cursor < FLAT.length - 1) {
      setTimeout(() => setCursor((c) => c + 1), 150);
    }
  }

  function handleSave() {
    const scored = scoreWOMAC(answers);
    onSave({ answers, scored });
  }

  const allAnswered = answeredCount === FLAT.length;
  const SectionIcon = SECTION_META[current.section].icon;

  return (
    <StepFrame icon={Footprints} title={t("steps.womacTitle")} subtitle={t("steps.womacSubtitle")} reference="Bellamy et al., Journal of Rheumatology, 1988">
      {questionnaireFallback && (
        <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
          Full translation of this questionnaire into the selected language is pending clinical review — questions shown in English for accuracy.
        </p>
      )}

      <div className="mb-5">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>{t("steps.questionOf", { n: cursor + 1, total: FLAT.length })}</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg,#0284c7,#0d9488)" }} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white/50 p-6 mb-5 min-h-[180px] flex flex-col justify-center">
        <div className="flex items-center gap-2 text-xs font-semibold text-clinical-600 uppercase tracking-wide mb-3">
          <SectionIcon size={14} /> {current.section}
        </div>
        <p className="text-base font-medium text-slate-800 mb-5">{current.text}</p>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {WOMAC_SCALE.map((opt) => (
            <button
              key={opt.value}
              onClick={() => choose(opt.value)}
              className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                currentValue === opt.value
                  ? "text-white border-transparent"
                  : "bg-white/70 text-slate-600 border-slate-200/80 hover:bg-white"
              }`}
              style={currentValue === opt.value ? { background: "linear-gradient(135deg,#0284c7,#0d9488)" } : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button className="btn-ghost" disabled={cursor === 0} onClick={() => setCursor((c) => Math.max(0, c - 1))}>
          <ArrowLeft size={15} /> {t("common.back")}
        </button>
        {cursor < FLAT.length - 1 ? (
          <button className="btn-secondary" disabled={currentValue == null} onClick={() => setCursor((c) => c + 1)}>
            {t("common.next")} <ArrowRight size={15} />
          </button>
        ) : (
          <button className="btn-primary" disabled={!allAnswered} onClick={handleSave}>
            <CheckCircle2 size={15} /> {t("common.save")}
          </button>
        )}
      </div>
    </StepFrame>
  );
}
