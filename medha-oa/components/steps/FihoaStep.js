"use client";

import { useState } from "react";
import StepFrame from "./StepFrame";
import { FIHOA_QUESTIONS, FIHOA_SCALE, scoreFIHOA } from "@/lib/fihoa";
import { Hand, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";

export default function FihoaStep({ initialData, onSave }) {
  const { t, questionnaireFallback } = useT();
  const [answers, setAnswers] = useState(initialData?.answers || Array(FIHOA_QUESTIONS.length).fill(null));
  const [cursor, setCursor] = useState(0);

  const currentValue = answers[cursor];
  const answeredCount = answers.filter((v) => v != null).length;
  const progressPct = Math.round((answeredCount / FIHOA_QUESTIONS.length) * 100);

  function choose(value) {
    setAnswers((a) => {
      const copy = [...a];
      copy[cursor] = value;
      return copy;
    });
    if (cursor < FIHOA_QUESTIONS.length - 1) {
      setTimeout(() => setCursor((c) => c + 1), 150);
    }
  }

  function handleSave() {
    onSave({ answers, scored: scoreFIHOA(answers) });
  }

  const allAnswered = answeredCount === FIHOA_QUESTIONS.length;

  return (
    <StepFrame icon={Hand} title={t("steps.fihoaTitle")} subtitle={t("steps.fihoaSubtitle")} reference="Dreiser et al., Revue du Rhumatisme, 1995">
      {questionnaireFallback && (
        <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
          Full translation of this questionnaire into the selected language is pending clinical review — questions shown in English for accuracy.
        </p>
      )}

      <div className="mb-5">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>{t("steps.questionOf", { n: cursor + 1, total: FIHOA_QUESTIONS.length })}</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg,#0284c7,#0d9488)" }} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white/50 p-6 mb-5 min-h-[160px] flex flex-col justify-center">
        <p className="text-base font-medium text-slate-800 mb-5">Can the patient: {FIHOA_QUESTIONS[cursor]}?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {FIHOA_SCALE.map((opt) => (
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
        {cursor < FIHOA_QUESTIONS.length - 1 ? (
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
