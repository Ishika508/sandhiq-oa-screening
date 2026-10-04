/**
 * Hand OA reference gallery — image manifest and descriptive text.
 *
 * IMPORTANT SCOPE NOTE
 * --------------------
 * The FIHOA questionnaire this step records scores HAND FUNCTION, not imaging
 * severity. These images are a visual orientation aid for the clinician while
 * they answer the functional questions — they are not the answer key, and a
 * patient must never be graded from a picture. Grading comes from the
 * questionnaire answers; the images only help the assessor recognise what mild
 * through severe hand OA tends to look like.
 *
 * File layout
 * -----------
 * Drop 8 files into `public/images/hand/`:
 *
 *   normal-xray.jpg      normal-hand.jpg
 *   mild-xray.jpg        mild-hand.jpg
 *   moderate-xray.jpg    moderate-hand.jpg
 *   severe-xray.jpg      severe-hand.jpg
 *
 * Until each .jpg exists the component falls back to the matching .svg
 * placeholder, which is labelled with the filename it is waiting for. So an
 * unfilled slot is visible rather than silently broken.
 */

/** Modality metadata. `src` is the file to upload, `fallback` the placeholder. */
export const HAND_MODALITIES = {
  xray: { key: "xray", label: "X-ray", short: "Radiograph" },
  hand: { key: "hand", label: "Hand photo", short: "Clinical photo" },
};

/** The four grades, worst-last, so the grid reads left to right. */
export const HAND_GRADES = [
  {
    key: "normal",
    label: "Normal",
    accent: "#0d9488",
    blurb: "No radiographic or clinical features of hand OA.",
    findings: [
      "Joint spaces preserved throughout, no narrowing.",
      "No osteophytes at the DIP or PIP joints.",
      "No marginal erosions; subchondral bone normal.",
      "No Heberden's or Bouchard's nodes; skin and alignment unremarkable.",
    ],
    fihoaHint: "Patient answers 'No difficulty' on most items.",
  },
  {
    key: "mild",
    label: "Mild",
    accent: "#0284c7",
    blurb: "Early changes; function usually still near normal.",
    findings: [
      "Small, definite osteophytes at the DIP and PIP joints.",
      "Joint space preserved or only equivocal narrowing.",
      "No erosions; no subluxation.",
      "Possible early Heberden's nodes — small, firm, non-tender swellings.",
    ],
    fihoaHint: "Patient reports 'possible but with difficulty' on grip and pinching items.",
  },
  {
    key: "moderate",
    label: "Moderate",
    accent: "#b45309",
    blurb: "Established disease with measurable functional loss.",
    findings: [
      "Definite osteophytes and moderate joint space narrowing.",
      "Early erosions may be present at the DIP joints.",
      "MCP involvement suggests more generalised OA.",
      "Visible Heberden's and Bouchard's nodes; early deformity.",
    ],
    fihoaHint: "Several items answered 'possible but with difficulty'; grip clearly reduced.",
  },
  {
    key: "severe",
    label: "Severe",
    accent: "#b91c1c",
    blurb: "Advanced disease with major deformity and functional loss.",
    findings: [
      "Large osteophytes with marked or subtotal joint space loss.",
      "Erosions and subluxation; deformity of the finger joints.",
      "Prominent, often tender nodes; loss of alignment.",
      "Reduced pinch and grip; difficulty with everyday tasks.",
    ],
    fihoaHint: "Multiple items answered 'impossible / severe difficulty'.",
  },
];

/**
 * Build the flat image list the gallery and lightbox iterate over.
 * Order is grade-then-modality so adjacent entries are the same patient
 * severity in the two modalities.
 */
export const HAND_IMAGES = HAND_GRADES.flatMap((grade) =>
  Object.keys(HAND_MODALITIES).map((modality) => ({
    id: `${grade.key}-${modality}`,
    grade: grade.key,
    gradeLabel: grade.label,
    accent: grade.accent,
    modality,
    modalityLabel: HAND_MODALITIES[modality].label,
    /** The upload target. */
    src: `/images/hand/${grade.key}-${modality}.jpg`,
    /** Shown until the .jpg is supplied. */
    fallback: `/images/hand/${grade.key}-${modality}.svg`,
    /** Exact filename to drop into public/images/hand/. */
    filename: `${grade.key}-${modality}.jpg`,
    blurb: grade.blurb,
    findings: grade.findings,
    fihoaHint: grade.fihoaHint,
  }))
);

export function handImageById(id) {
  return HAND_IMAGES.find((img) => img.id === id) || null;
}
