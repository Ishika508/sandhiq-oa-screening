// lib/fihoa.js
// FIHOA - Functional Index for Hand Osteoarthritis
// Reference: Dreiser et al., Revue du Rhumatisme, 1995.
// 10 items, each scored 0 (able without difficulty) - 2 (impossible).

export const FIHOA_SCALE = [
  { value: 0, label: "No difficulty" },
  { value: 1, label: "Possible but with difficulty" },
  { value: 2, label: "Impossible / severe difficulty" },
];

export const FIHOA_QUESTIONS = [
  "Turn a key in a lock",
  "Cut meat with a knife",
  "Snap or fasten buttons",
  "Hold a full pitcher/jug with one hand",
  "Open a jar previously opened",
  "Sew (or equivalent task)",
  "Do or undo buttons",
  "Turn a doorknob or door handle",
  "Grip a car door handle to open the door",
  "Cut/trim fingernails",
];

export function scoreFIHOA(answers) {
  // answers: number[10]
  const total = (answers || []).reduce((a, b) => a + (Number(b) || 0), 0); // max 30
  const totalPct = Math.round((total / 30) * 100);
  return { total, totalPct, band: bandFromPct(totalPct) };
}

function bandFromPct(pct) {
  if (pct < 25) return "Low";
  if (pct < 50) return "Moderate";
  return "High";
}
