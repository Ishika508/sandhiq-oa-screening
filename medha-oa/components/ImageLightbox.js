"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";

/**
 * Centred full-screen image viewer.
 *
 * Rendered through a portal onto <body> so it is not clipped by the step's
 * card, scroller, or any ancestor with a transform — the previous `position:
 * fixed` overlay approach jumped around inside transformed parents.
 *
 * Accessibility/behaviour that is easy to get wrong and is handled here:
 *  - Escape closes.
 *  - Left/right arrows move between images when a group is supplied.
 *  - The page behind is scroll-locked and restored exactly as it was.
 *  - Focus moves into the dialog on open and returns to the trigger on close,
 *    and Tab is trapped inside it.
 *  - Backdrop click closes, but a click that started inside the panel and
 *    released outside does not (otherwise dragging a selection closes it).
 */
export default function ImageLightbox({
  images = [],
  index = null,
  onClose,
  onIndexChange,
}) {
  const open = index != null && images.length > 0;
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const dragRef = useRef(false);
  const [src, setSrc] = useState(null);
  const [natural, setNatural] = useState(null);

  const image = open ? images[index] : null;

  // Swap to the placeholder if the real image has not been supplied yet.
  useEffect(() => {
    setNatural(null);
    if (!image) { setSrc(null); return; }
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      setSrc(image.src);
      setNatural({ w: probe.naturalWidth, h: probe.naturalHeight });
    };
    probe.onerror = () => { if (!cancelled) setSrc(image.fallback || image.src); };
    probe.src = image.src;
    return () => { cancelled = true; };
  }, [image]);

  // Some reference images are supplied far below display size. Upscaling them
  // to fill an 86vh pane turns a 211px photo into mush and reads as a broken
  // image, so cap the rendered size at the file's own resolution and say so.
  const LOW_RES_PX = 500;
  const tooSmall = natural ? Math.min(natural.w, natural.h) < LOW_RES_PX : false;
  const displayStyle = tooSmall
    ? { width: natural.w, maxWidth: "100%", maxHeight: "86vh" }
    : { maxWidth: "100%", maxHeight: "86vh" };

  const move = useCallback(
    (delta) => {
      if (!images.length || !onIndexChange) return;
      const next = (index + delta + images.length) % images.length;
      onIndexChange(next);
    },
    [index, images.length, onIndexChange]
  );

  // Global keys, only while open.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onClose?.(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
      else if (e.key === "Tab") {
        // Keep focus inside the dialog.
        const focusables = panelRef.current?.querySelectorAll(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || !focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, move]);

  // Lock body scroll, remembering the previous state and scrollbar width.
  useEffect(() => {
    if (!open) return undefined;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [open]);

  // Focus management.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement;
      closeRef.current?.focus();
    } else if (restoreFocusRef.current?.isConnected) {
      restoreFocusRef.current.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open]);

  if (!open || !image) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      onMouseDown={(e) => { dragRef.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (dragRef.current && e.target === e.currentTarget) onClose?.(); dragRef.current = false; }}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${image.gradeLabel} hand OA — ${image.modalityLabel}`}
        className="relative z-10 flex flex-col lg:flex-row w-full max-w-6xl max-h-full overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Image pane */}
        <div className="relative flex-1 min-h-[240px] lg:min-h-0 bg-slate-950 flex items-center justify-center">
          {src && (
            // A plain <img> keeps these medical references zoomable via the
            // browser's own image viewer and right-click > open.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={`${image.gradeLabel} hand osteoarthritis — ${image.modalityLabel}`}
              style={displayStyle}
              className="w-auto h-auto object-contain"
            />
          )}

          {tooSmall && natural && (
            <p className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md text-[10px] font-medium text-amber-100 bg-amber-900/70">
              shown at native {natural.w}×{natural.h} — supply a larger file to enlarge
            </p>
          )}

          {images.length > 1 && (
            <>
              <button
                onClick={() => move(-1)}
                aria-label="Previous image"
                className="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-black/45 text-white hover:bg-black/65 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => move(1)}
                aria-label="Next image"
                className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-black/45 text-white hover:bg-black/65 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-black/55">
            {image.modalityLabel}
          </span>
        </div>

        {/* Info pane */}
        <div className="w-full lg:w-[22rem] shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-slate-200 overflow-y-auto">
          <div className="p-5 flex-1">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-lg font-bold text-slate-800">{image.gradeLabel}</h3>
              <span
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-white"
                style={{ background: image.accent }}
              >
                {image.gradeLabel}
              </span>
            </div>
            <p className="text-sm text-slate-600 mb-4">{image.blurb}</p>

            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Typical features
            </p>
            <ul className="space-y-1.5 mb-4">
              {image.findings.map((f) => (
                <li key={f} className="flex gap-2 text-[13px] text-slate-700">
                  <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: image.accent }} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                FIHOA expectation
              </p>
              <p className="text-[13px] text-slate-700">{image.fihoaHint}</p>
            </div>

            <a
              href={src || image.src}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost w-full !py-2 text-xs"
            >
              <Download size={14} /> Open full size
            </a>
          </div>

          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 leading-relaxed">
            <p className="font-semibold text-amber-700 mb-0.5">
              Reference aid only — not a diagnostic grade.
            </p>
            FIHOA scores hand <em>function</em>; grade the patient from the
            questionnaire answers, never from this image.
          </div>
        </div>
      </div>

      {/* Close sits outside the panel so it never overlaps the image */}
      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close"
        className="absolute z-20 top-3 right-3 grid place-items-center w-9 h-9 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
      >
        <X size={18} />
      </button>

      {images.length > 1 && (
        <p className="absolute z-20 bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-white/70">
          {index + 1} / {images.length} · ← → to browse · Esc to close
        </p>
      )}
    </div>,
    document.body
  );
}
