// lib/womac.js
// WOMAC (Western Ontario & McMaster Universities Osteoarthritis Index)
// Reference: Bellamy et al., Journal of Rheumatology, 1988.
// Each item is scored 0 (none) - 4 (extreme). Higher = worse.

export const WOMAC_SCALE = [
  { value: 0, label: "None" },
  { value: 1, label: "Mild" },
  { value: 2, label: "Moderate" },
  { value: 3, label: "Severe" },
  { value: 4, label: "Extreme" },
];

export const WOMAC_QUESTIONS = {
  pain: [
    "Walking on a flat surface",
    "Going up or down stairs",
    "At night while in bed",
    "Sitting or lying",
    "Standing upright",
  ],
  stiffness: [
    "Morning stiffness after waking",
    "Stiffness later in the day",
  ],
  function: [
    "Descending stairs",
    "Ascending stairs",
    "Rising from sitting",
    "Standing",
    "Bending to floor",
    "Walking on flat surface",
    "Getting in/out of a car",
    "Going shopping",
    "Putting on socks/stockings",
    "Rising from bed",
    "Taking off socks/stockings",
    "Lying in bed",
    "Getting in/out of bath",
    "Sitting",
    "Getting on/off toilet",
    "Heavy household duties",
    "Light household duties",
  ],
};

export function scoreWOMAC(answers) {
  // answers: { pain: number[5], stiffness: number[2], function: number[17] }
  const sum = (arr) => (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
  const painScore = sum(answers.pain); // max 20
  const stiffnessScore = sum(answers.stiffness); // max 8
  const functionScore = sum(answers.function); // max 68
  const total = painScore + stiffnessScore + functionScore; // max 96
  const totalPct = Math.round((total / 96) * 100);
  return {
    painScore,
    stiffnessScore,
    functionScore,
    total,
    totalPct,
    band: bandFromPct(totalPct),
  };
}

function bandFromPct(pct) {
  if (pct < 25) return "Low";
  if (pct < 50) return "Moderate";
  return "High";
}
