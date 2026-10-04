"use client";

import { useEffect, useRef, useState } from "react";
import StepFrame from "./StepFrame";
import { Upload, ImageOff, CheckCircle2, Cpu, ScanLine, AlertTriangle, ServerCrash, Info } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";

const KL_LABELS = ["KL0 — Normal", "KL1 — Doubtful", "KL2 — Mild", "KL3 — Moderate", "KL4 — Severe"];
const KL_MEANING = [
  "No radiographic osteoarthritis",
  "Doubtful / very early change",
  "Mild osteoarthritis",
  "Moderate osteoarthritis",
  "Severe osteoarthritis",
];
// Grades 3-4 are the grades with enough support to act on clinically.
const SEVERE_KL = 3;
// Below this the model is effectively guessing, so we say so rather than
// dressing the number up.
const CONFIDENCE_FLOOR = 0.55;
// If the runner-up is this close, the call is not meaningful.
const AMBIGUITY_MARGIN = 0.15;

/**
 * Runs the deployed EfficientNet-B0 KL model. The Next route (/api/xray) owns
 * talking to the local Python/TensorFlow service, so this only deals with the
 * browser-facing contract.
 */
async function analyze(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/xray", { method: "POST", body: form });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.error) {
    const err = new Error(body?.message || "The X-ray model could not analyse this image.");
    err.code = body?.error || "MODEL_ERROR";
    throw err;
  }
  return body;
}

export default function XrayStep({ initialData, onSave }) {
  const { t } = useT();
  // Records saved before the real model was wired up carry `mock: true` and a
  // fabricated klGrade. Those numbers must never be shown as if the model had
  // produced them, and must never reach structuralSeverity(), so they are
  // treated as "needs re-running" rather than as a restored result.
  const legacyMock = !!(initialData?.mock && initialData?.klGrade != null);
  const [skipped, setSkipped] = useState(initialData?.skipped || false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(initialData?.preview || null);
  const [result, setResult] = useState(
    !legacyMock && initialData?.klGrade != null
      ? {
          predictedKl: initialData.klGrade,
          label: `KL${initialData.klGrade}`,
          confidence: initialData.confidence ?? 0,
          probabilities: initialData.probabilities || null,
          meaning: KL_MEANING[initialData.klGrade] || "",
          disclaimer: initialData.disclaimer || "",
        }
      : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [showEval, setShowEval] = useState(false);
  // Attention overlay is shown by default when the model returned one; the
  // toggle reveals the unmodified radiograph underneath it.
  const [showHeatmap, setShowHeatmap] = useState(true);
  const previewRef = useRef(null);

  // Pull the held-out evaluation report so the grade is shown with the real
  // measured performance of the model behind it.
  useEffect(() => {
    let alive = true;
    fetch("/api/xray")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setMeta(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(f);
    previewRef.current = url;
    setFile(f);
    setPreview(url);
    setResult(null);
    setError(null);
  }

  async function runInference() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await analyze(file));
    } catch (err) {
      setError({ code: err.code, message: err.message });
    } finally {
      setLoading(false);
    }
  }

  function handleSaveWithResult() {
    onSave({
      skipped: false,
      preview,
      klGrade: result.predictedKl,
      confidence: result.confidence,
      probabilities: result.probabilities,
      meaning: result.meaning,
      disclaimer: result.disclaimer,
    });
  }

  function handleSkip() {
    onSave({ skipped: true });
  }

  const probs = result?.probabilities
    ? Object.entries(result.probabilities).sort((a, b) => b[1] - a[1])
    : null;
  const top = probs?.[0];
  const runnerUp = probs?.[1];
  const ambiguous = !!(top && runnerUp && top[1] - runnerUp[1] < AMBIGUITY_MARGIN);
  const uncertain = !!(result && (result.confidence < CONFIDENCE_FLOOR || ambiguous));
  const evalSummary = meta?.summary || meta?.metadata?.summary;

  return (
    <StepFrame icon={ScanLine} title={t("steps.xrayTitle")} subtitle={t("steps.xraySubtitle")} reference="Tiulpin et al., Scientific Reports, 2018">
      {!skipped ? (
        <>
          <div className="border-2 border-dashed border-slate-300/70 rounded-xl p-6 text-center mb-4 bg-white/30">
            {preview ? (
              <img src={preview} alt="X-ray preview" className="max-h-56 mx-auto rounded-lg mb-3" />
            ) : (
              <Upload size={28} className="mx-auto text-slate-300 mb-2" />
            )}
            <label className="btn-secondary cursor-pointer inline-flex">
              {preview ? "Change image" : "Upload knee X-ray"}
              <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </label>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200/80 bg-red-50/70 p-3 mb-4 text-xs text-red-700">
              <div className="flex items-start gap-2">
                <ServerCrash size={15} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Analysis failed</div>
                  <div className="mt-0.5">{error.message}</div>
                  {error.code === "MODEL_UNAVAILABLE" && (
                    <code className="block mt-1.5 text-[11px] bg-white/70 rounded px-2 py-1 select-all">
                      npm run ml:serve
                    </code>
                  )}
                </div>
              </div>
            </div>
          )}

          {legacyMock && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 mb-4 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Previous result came from the placeholder classifier</div>
                <div className="mt-0.5">
                  It was a test stub, not the trained model, so it has been discarded rather than
                  carried into the report. Re-upload the image below to get a real KL grade.
                </div>
              </div>
            </div>
          )}

          {preview && !file && !result && !loading && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/70 rounded-lg px-3 py-2 mb-3">
              Choose the image file again to run the real model — a stored preview cannot be
              re-analysed without the original file.
            </p>
          )}

          {file && !result && (
            <button className="btn-primary w-full mb-4" disabled={loading} onClick={runInference}>
              <Cpu size={16} className={loading ? "animate-pulse" : ""} />{" "}
              {loading ? "Analysing…" : "Run KL-Grade Analysis"}
            </button>
          )}

          {loading && (
            <p className="text-[11px] text-slate-500 text-center mb-4">
              EfficientNet-B0 running with horizontal-flip test-time augmentation…
            </p>
          )}

          {result && (
            <div className="rounded-xl bg-white/50 border border-slate-200/70 p-4 mb-4">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <div className="text-sm font-semibold text-slate-800">
                  {KL_LABELS[result.predictedKl] ?? result.label}
                </div>
                <div className="text-xs font-semibold text-slate-700 tabular-nums">
                  {(result.confidence * 100).toFixed(1)}%
                </div>
              </div>
              <div className="text-[11px] text-slate-500 mb-2">{result.meaning || KL_MEANING[result.predictedKl]}</div>
              <div className="h-1.5 rounded-full bg-slate-200/70 overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(result.confidence * 100, 2)}%`,
                    background: result.predictedKl >= SEVERE_KL ? "linear-gradient(90deg,#d97706,#dc2626)" : "linear-gradient(90deg,#0284c7,#0d9488)",
                  }}
                />
              </div>

              {probs && (
                <div className="space-y-1.5">
                  {probs.map(([k, v]) => {
                    const idx = Number(k.replace(/\D/g, ""));
                    return (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 w-7 shrink-0 tabular-nums">{k}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-200/60 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-sky-600/70"
                            style={{ width: `${Math.max(v * 100, 1)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 w-9 text-right tabular-nums">
                          {(v * 100).toFixed(0)}%
                        </span>
                        <span className="hidden sm:inline text-[10px] text-slate-400 w-24 truncate">
                          {KL_MEANING[idx]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {uncertain && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/70 rounded-lg px-3 py-2 mt-3 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    Low-confidence estimate{ambiguous ? " — the model is close between adjacent grades" : ""}.
                    Treat this as an indication only and have a radiologist confirm.
                  </span>
                </p>
              )}

              <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                {result.disclaimer || "AI-assisted screening estimate, not a medical diagnosis."}
              </p>

              {result.gradcam?.imageBase64 && (
                <div className="mt-4 pt-4 border-t border-slate-200/70">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-slate-700">
                      {result.gradcam.caption}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowHeatmap((v) => !v)}
                      className="text-[10px] text-slate-500 underline inline-flex items-center gap-1"
                    >
                      {showHeatmap ? "Show plain X-ray" : "Show attention map"}
                    </button>
                  </div>

                  {showHeatmap ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/png;base64,${result.gradcam.imageBase64}`}
                        alt="X-ray with Grad-CAM model attention overlay"
                        className="w-full max-w-sm mx-auto rounded-lg border border-slate-200/70"
                      />
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <span className="text-[10px] text-slate-400">low attention</span>
                        <span
                          className="h-2 rounded-full"
                          style={{
                            width: 96,
                            background:
                              "linear-gradient(90deg,#000080,#0000ff,#00ffff,#00ff00,#ffff00,#ff0000)",
                          }}
                        />
                        <span className="text-[10px] text-slate-400">high</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                        {result.gradcam.note}
                      </p>
                      {result.gradcam.baseClass && result.gradcam.baseClass !== result.label && (
                        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/70 rounded-lg px-2 py-1.5 mt-2">
                          Map computed from the base model&rsquo;s {result.gradcam.baseClass} prediction,
                          which differs from the flip-averaged grade above. The grade{" "}
                          <strong>{result.label}</strong> is the reported result.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt="Uploaded X-ray"
                        className="w-full max-w-sm mx-auto rounded-lg border border-slate-200/70"
                      />
                      <p className="text-[10px] text-slate-400 mt-2 text-center">
                        Original upload, without the attention overlay.
                      </p>
                    </>
                  )}
                </div>
              )}

              {meta?.model && (
                <button
                  type="button"
                  onClick={() => setShowEval((v) => !v)}
                  className="text-[10px] text-slate-500 underline mt-2 inline-flex items-center gap-1"
                >
                  <Info size={11} /> How reliable is this model?
                </button>
              )}

              {showEval && evalSummary && (
                <div className="text-[10px] text-slate-600 bg-white/70 border border-slate-200/70 rounded-lg px-3 py-2 mt-2 space-y-1">
                  <div>
                    {evalSummary.model} · validated on {evalSummary.testSamples?.toLocaleString?.() ?? evalSummary.testSamples}{" "}
                    held-out radiographs
                  </div>
                  <div>
                    Overall accuracy {((evalSummary.accuracy || 0) * 100).toFixed(1)}% · macro F1{" "}
                    {(evalSummary.macroF1 || 0).toFixed(2)}
                  </div>
                  {(meta?.metadata?.perClass || []).map((c) => (
                    <div key={c.kl} className="flex justify-between gap-2">
                      <span>
                        {c.label} {c.meaning}
                      </span>
                      <span className="tabular-nums">
                        recall {c.recall != null ? `${(c.recall * 100).toFixed(0)}%` : "n/a"}
                      </span>
                    </div>
                  ))}
                  <p className="text-slate-500 pt-1 border-t border-slate-200/70">
                    The model is weakest at KL1, so early-stage changes are frequently reported as KL0.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!result} onClick={handleSaveWithResult}>
              <CheckCircle2 size={16} /> {t("common.save")}
            </button>
            <button className="btn-ghost" onClick={() => setSkipped(true)}>
              <ImageOff size={16} /> No X-ray available
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-6">
          <ImageOff size={28} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500 mb-4">X-ray marked as unavailable. Risk fusion will rebalance weights across the remaining tests.</p>
          <div className="flex gap-2 justify-center">
            <button className="btn-ghost" onClick={() => setSkipped(false)}>Actually, I have one</button>
            <button className="btn-primary" onClick={handleSkip}>Continue without X-ray</button>
          </div>
        </div>
      )}
    </StepFrame>
  );
}
