"use client";

import { Check } from "lucide-react";

export default function StepNav({ steps, currentIndex, completed, onJump }) {
  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const done = completed.has(s.key);
        const active = i === currentIndex;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex min-w-[76px] flex-1 items-start">
            <button
              onClick={() => onJump(i)}
              className={`flex min-w-[68px] flex-col items-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium whitespace-nowrap transition-colors ${active ? "text-white" : done ? "bg-teal-50 text-teal-700 border border-teal-100" : "bg-white/60 text-slate-500 border border-slate-200/70"}`}
              style={active ? { background: "linear-gradient(135deg,#0284c7,#0d9488)" } : undefined}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${active ? "bg-white/20" : done ? "bg-teal-100" : "bg-slate-100"}`}>{done && !active ? <Check size={13} /> : <Icon size={13} />}</span>
              {s.shortLabel}
            </button>
            {i < steps.length - 1 && <span className={`mt-5 h-px min-w-3 flex-1 ${done ? "bg-teal-400" : "border-t border-dashed border-slate-300"}`} />}
          </div>
        );
      })}
    </div>
  );
}
