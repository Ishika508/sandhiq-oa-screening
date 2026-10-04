"use client";

import { useState, useRef } from "react";
import StepFrame from "./StepFrame";
import HandReferenceGallery from "@/components/HandReferenceGallery";
import { Volume2, VolumeX, CheckCircle2, Hand } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";

const NODAL_OPTIONS = [
  { value: 0, label: "No visible nodes", desc: "No bony swelling at finger joints" },
  { value: 1, label: "Mild nodal changes", desc: "Slight swelling, one or two joints" },
  { value: 2, label: "Moderate nodal changes", desc: "Clear Heberden's/Bouchard's nodes, several joints" },
  { value: 3, label: "Severe nodal changes", desc: "Marked deformity, thumb-base squaring, multiple joints" },
];

const VOICE_SCRIPT =
  "Please ask the patient to place both hands flat on the table, palm down. " +
  "Compare the finger joints against the four reference photographs shown. " +
  "Also check the base of the thumb for squaring or swelling. " +
  "Select the option that best matches what you observe.";

export default function HandStep({ initialData, onSave }) {
  const { t } = useT();
  const [nodalSeverity, setNodalSeverity] = useState(initialData?.nodalSeverity ?? null);
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [playing, setPlaying] = useState(false);

  function playVoiceGuide() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(VOICE_SCRIPT);
    utter.rate = 0.95;
    utter.onend = () => setPlaying(false);
    setPlaying(true);
    window.speechSynthesis.speak(utter);
  }
  function stopVoiceGuide() {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setPlaying(false);
  }

  function handleSave() {
    onSave({ nodalSeverity, notes, method: "voice_assisted_manual" });
  }

  return (
    <StepFrame
      icon={Hand}
      title={t("steps.handTitle")}
      subtitle="Voice-guided — automated image analysis is planned for a future release; this step is completed by the health worker's own observation."
      reference="Kalichman & Hernández-Molina, Seminars in Arthritis and Rheumatism, 2010"
    >
      <div className="rounded-2xl bg-clinical-50/70 border border-clinical-100 p-4 mb-5 flex items-start gap-3">
        <button
          onClick={playing ? stopVoiceGuide : playVoiceGuide}
          className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-white ${playing ? "bg-rose-500" : ""}`}
          style={!playing ? { background: "linear-gradient(135deg,#0284c7,#0d9488)" } : undefined}
        >
          {playing ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <div>
          <p className="text-sm font-medium text-clinical-900">{playing ? "Playing instructions…" : "Play voice instructions"}</p>
          <p className="text-xs text-clinical-700 mt-1">{VOICE_SCRIPT}</p>
        </div>
      </div>

      <HandReferenceGallery />

      <div className="space-y-2 mb-4">
        {NODAL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setNodalSeverity(opt.value)}
            className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
              nodalSeverity === opt.value ? "border-clinical-400 bg-clinical-50/70" : "border-slate-200/70 bg-white/40 hover:bg-white/70"
            }`}
          >
            <div
              className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${nodalSeverity === opt.value ? "" : "bg-slate-200"}`}
              style={nodalSeverity === opt.value ? { background: "linear-gradient(135deg,#0284c7,#0d9488)" } : undefined}
            >
              {nodalSeverity === opt.value && <CheckCircle2 size={14} className="text-white" />}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
              <div className="text-xs text-slate-500">{opt.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mb-5">
        <label className="label">Additional notes (optional)</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <button className="btn-primary w-full" disabled={nodalSeverity == null} onClick={handleSave}>
        {t("common.save")}
      </button>
    </StepFrame>
  );
}
