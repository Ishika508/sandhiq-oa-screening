/**
 * Anthropometric helpers: BMI and its clinical classification.
 *
 * Height and weight are compulsory fields on the patient record, so BMI is
 * always derivable once a patient exists. BMI is reported alongside the
 * weight-bearing load that drives knee OA progression, which is why it belongs
 * in the fusion picture rather than being decoration on the demographics box.
 *
 * Two classification systems are provided because they disagree in exactly the
 * range this app's users fall in:
 *
 *   - WHO standard cut-offs (underweight <18.5, obesity >=30)
 *   - WHO Asian / "Asian-Indian" cut-offs (overweight >=23, obesity >=27.5),
 *     which is the correct reference for South Asian populations. The same BMI
 *     that is "normal" under the standard table is "overweight" here, and
 *     Asian cohorts carry greater knee OA risk at lower BMI.
 *
 * The Asian table is flagged as primary for this population, but both are
 * always shown so a clinician can see the classification is not being hidden.
 */

// Plausible adult range. Outside this a value is almost certainly a typo
// (cm/feet mix-up, or weight in pounds) and must not be silently accepted.
export const HEIGHT_CM_MIN = 100;
export const HEIGHT_CM_MAX = 230;
export const WEIGHT_KG_MIN = 20;
export const WEIGHT_KG_MAX = 300;

const WHO_STANDARD = [
  { max: 18.5, label: "Underweight", tone: "info" },
  { max: 25, label: "Normal weight", tone: "good" },
  { max: 30, label: "Overweight", tone: "warn" },
  { max: 35, label: "Obese (class I)", tone: "bad" },
  { max: 40, label: "Obese (class II)", tone: "bad" },
  { max: Infinity, label: "Obese (class III)", tone: "bad" },
];

const WHO_ASIAN = [
  { max: 18.5, label: "Underweight", tone: "info" },
  { max: 23, label: "Normal weight", tone: "good" },
  { max: 27.5, label: "Overweight", tone: "warn" },
  { max: 32.5, label: "Obese (class I)", tone: "bad" },
  { max: 37.5, label: "Obese (class II)", tone: "bad" },
  { max: Infinity, label: "Obese (class III)", tone: "bad" },
];

function classify(bmi, table) {
  const row = table.find((r) => bmi < r.max) || table[table.length - 1];
  return row;
}

export function classifyBMI(bmi, system = "asian") {
  if (bmi == null || !Number.isFinite(bmi)) return null;
  const primary = system === "standard" ? WHO_STANDARD : WHO_ASIAN;
  const secondary = system === "standard" ? WHO_ASIAN : WHO_STANDARD;
  return {
    bmi: Math.round(bmi * 10) / 10,
    system,
    primary: classify(bmi, primary),
    alsoKnownAs: classify(bmi, secondary),
  };
}

/**
 * @returns {{bmi:number|null, classification:object|null, error:string|null}}
 */
export function computeBMI(heightCm, weightKg) {
  const h = Number(heightCm);
  const w = Number(weightKg);

  if (!Number.isFinite(h) || h <= 0) {
    return { bmi: null, classification: null, error: "Height is required to compute BMI." };
  }
  if (!Number.isFinite(w) || w <= 0) {
    return { bmi: null, classification: null, error: "Weight is required to compute BMI." };
  }
  if (h < HEIGHT_CM_MIN || h > HEIGHT_CM_MAX) {
    return {
      bmi: null,
      classification: null,
      error: `Height must be between ${HEIGHT_CM_MIN} and ${HEIGHT_CM_MAX} cm.`,
    };
  }
  if (w < WEIGHT_KG_MIN || w > WEIGHT_KG_MAX) {
    return {
      bmi: null,
      classification: null,
      error: `Weight must be between ${WEIGHT_KG_MIN} and ${WEIGHT_KG_MAX} kg.`,
    };
  }

  const bmi = w / Math.pow(h / 100, 2);
  return { bmi: Math.round(bmi * 10) / 10, classification: classifyBMI(bmi, "asian"), error: null };
}

/** Body-surface area (Mosteller). Relevant for weight-bearing load framing. */
export function bodySurfaceAreaM2(heightCm, weightKg) {
  const h = Number(heightCm) / 100;
  const w = Number(weightKg);
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return null;
  return Math.round(Math.sqrt((h * 170) * w / 3600) * 100) / 100;
}

export function isValidHeight(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= HEIGHT_CM_MIN && n <= HEIGHT_CM_MAX;
}

export function isValidWeight(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= WEIGHT_KG_MIN && n <= WEIGHT_KG_MAX;
}
