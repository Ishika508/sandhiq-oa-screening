"use client";

import { useCallback, useState } from "react";
import ImageLightbox from "@/components/ImageLightbox";
import { HAND_GRADES, HAND_IMAGES } from "@/lib/handReference";
import { Images, Maximize2 } from "lucide-react";

/**
 * Hand OA reference gallery: four grades x two modalities (radiograph + photo).
 *
 * Lives in its own component because the Hand step shows it as a reference
 * aid while the assessor assigns the nodal grade. Keeping one implementation
 * means the images, lightbox, and labels cannot drift out of sync.
 *
 * Images resolve from /images/hand/<grade>-<modality>.jpg and fall back to the
 * labelled .svg placeholder when a file has not been supplied, so a gap reads
 * as "waiting for this file" rather than as a broken image.
 */
export default function HandReferenceGallery({ defaultOpen = true, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  const [lightbox, setLightbox] = useState(null);

  const openLightbox = useCallback((id) => {
    setLightbox(HAND_IMAGES.findIndex((img) => img.id === id));
  }, []);
  const setLightboxIndex = useCallback((i) => setLightbox(i), []);

  return (
    <div className={`mb-5 rounded-2xl border border-slate-200/70 bg-white/50 ${className}`}>
      <button
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Images size={16} className="text-clinical-500" />
          Hand visual reference
          <span className="text-[11px] font-normal text-slate-400">
            radiograph + photo for each grade
          </span>
        </span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-200/70 pt-3">
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
            Reference aid only. FIHOA scores hand <strong>function</strong> — grade the
            patient from the answers, not from these images.
          </p>

          <div className="space-y-3">
            {HAND_GRADES.map((grade) => (
              <div key={grade.key}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: grade.accent }} />
                  <span className="text-xs font-semibold text-slate-700">{grade.label}</span>
                  <span className="text-[11px] text-slate-400 truncate">{grade.blurb}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {HAND_IMAGES.filter((img) => img.grade === grade.key).map((img) => (
                    <ReferenceTile key={img.id} image={img} onOpen={openLightbox} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ImageLightbox
        images={HAND_IMAGES}
        index={lightbox}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}

/**
 * One reference thumbnail. Falls back to the labelled placeholder when the real
 * .jpg has not been dropped in yet, so an unfilled slot is visibly unfilled
 * instead of showing a broken image.
 */
function ReferenceTile({ image, onOpen }) {
  const [src, setSrc] = useState(image.src);

  return (
    <button
      onClick={() => onOpen(image.id)}
      title={`${image.gradeLabel} — ${image.modalityLabel}`}
      className="group relative overflow-hidden rounded-xl border border-slate-200/70 bg-slate-950 text-left hover:border-clinical-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-clinical-400 transition-colors"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${image.gradeLabel} hand osteoarthritis — ${image.modalityLabel}`}
        onError={() => { if (src !== image.fallback) setSrc(image.fallback); }}
        className="w-full h-24 object-cover opacity-90 group-hover:opacity-100 transition-opacity"
        loading="lazy"
      />
      <span
        className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
        style={{ background: image.accent }}
      >
        {image.modalityLabel}
      </span>
      <span className="absolute inset-0 grid place-items-center bg-slate-950/0 group-hover:bg-slate-950/35 transition-colors">
        <Maximize2 size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
      <span className="absolute bottom-0 inset-x-0 px-2 py-1 text-[10px] font-mono text-slate-300 bg-slate-950/70 truncate">
        {image.filename}
      </span>
    </button>
  );
}
