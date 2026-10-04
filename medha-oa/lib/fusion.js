// lib/fusion.js
//
// Multimodal OA risk fusion — implements the weighted-scoring design from
// the SANDHIQ Solution Design Annex:
//
//   Combined Risk = Structural*0.25 + Functional*0.25 + Biomechanical*0.20
//                 + Contextual*0.20 + HandOA*0.10   (X-ray available)
//
//   When X-ray is unavailable, Structural's 25% is redistributed
//   proportionally across the remaining four domains (see WEIGHTS below).
//
// Every domain score is normalised to a common 0-100 "severity" scale
// before weighting. All thresholds/weights are marked TBV (to be
// clinically validated) in the source design doc — treat the resulting
// bands as a screening triage aid, never a diagnosis.

import { tugPoints } from "./pose/poseEngine";

export const WEIGHTS = {
  withXray: { structural: 0.25, functional: 0.25, biomechanical: 0.2, contextual: 0.2, handOA: 0.1 },
  withoutXray: { structural: 0, functional: 0.33, biomechanical: 0.27, contextual: 0.27, handOA: 0.13 },
};

// ---- Per-domain severity extraction (0-100 scale, higher = worse) ----

export function structuralSeverity(xrayStep) {
  if (!xrayStep || xrayStep.skipped) return null;
  // klGrade: 0-4. Map to 0-100.
  const kl = Number(xrayStep.klGrade ?? 0);
  return Math.round((kl / 4) * 100);
}

export function functionalSeverity(cvStep) {
  if (!cvStep) return null;
  const parts = [];
  // SPPB: prefer the valid-point percentage so a partial assessment (fewer
  // than 12 valid points) is not scored as though the missing tests scored 0.
  // Falls back to the raw 0-12 total for records saved before that field.
  if (cvStep.sppbPct != null) {
    parts.push(100 - cvStep.sppbPct);
  } else if (cvStep.sppbTotal != null) {
    parts.push(((12 - cvStep.sppbTotal) / 12) * 100);
  }
  // TUG: seconds -> severity, using the same banding the CV step reports so
  // the two can never disagree.
  if (cvStep.results?.tug?.seconds != null) {
    const { score } = tugPoints(cvStep.results.tug.seconds);
    if (score != null) parts.push(score);
  }
  // Knee ROM: smaller flexion range = worse. ~130 deg treated as a
  // reasonable healthy reference range (TBV).
  if (cvStep.results?.rom?.flexionRange != null) {
    const healthyRange = 130;
    const deficit = Math.max(0, healthyRange - cvStep.results.rom.flexionRange);
    parts.push(Math.min(100, Math.round((deficit / healthyRange) * 100)));
  }
  if (!parts.length) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

export function biomechanicalSeverity(imuStep) {
  if (!imuStep) return null;
  // riskScore already 0-100 severity (from IMU module / manual entry)
  if (imuStep.riskScore == null) return null;
  return Math.round(Number(imuStep.riskScore));
}

export function contextualSeverity(womacScore, fihoaScore) {
  const parts = [];
  if (womacScore != null) parts.push(womacScore);
  if (fihoaScore != null) parts.push(fihoaScore);
  if (!parts.length) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

export function handOASeverity(handStep, gripStep) {
  const parts = [];
  if (handStep?.nodalSeverity != null) {
    // 0 (none) - 3 (severe) -> 0-100
    parts.push(Math.round((Number(handStep.nodalSeverity) / 3) * 100));
  }
  if (gripStep?.gripBand) {
    const map = { healthy: 10, moderate: 50, low: 90 };
    parts.push(map[gripStep.gripBand] ?? 50);
  }
  if (!parts.length) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

export function bandFromScore(score) {
  if (score < 30) return { label: "Low", color: "emerald" };
  if (score < 65) return { label: "Moderate", color: "amber" };
  return { label: "High", color: "rose" };
}

/**
 * Compute the combined fused OA risk from all step data.
 * @param {object} steps - output of getAllSteps(screeningId)
 */
export function computeFusion(steps) {
  const xrayAvailable = !!(steps.xray && !steps.xray.skipped && steps.xray.klGrade != null);
  const weights = xrayAvailable ? WEIGHTS.withXray : WEIGHTS.withoutXray;

  const womac = steps.womac?.scored?.totalPct ?? null;
  const fihoa = steps.fihoa?.scored?.totalPct ?? null;

  const domainScores = {
    structural: structuralSeverity(steps.xray),
    functional: functionalSeverity(steps.cv),
    biomechanical: biomechanicalSeverity(steps.imu),
    contextual: contextualSeverity(womac, fihoa),
    handOA: handOASeverity(steps.hand, steps.grip),
  };

  let weightedSum = 0;
  let weightUsed = 0;
  const contributions = {};

  for (const domain of Object.keys(weights)) {
    const score = domainScores[domain];
    const w = weights[domain];
    if (score == null || w === 0) {
      contributions[domain] = null;
      continue;
    }
    weightedSum += score * w;
    weightUsed += w;
    contributions[domain] = { score, weight: w, contribution: Math.round(score * w * 10) / 10 };
  }

  // Renormalise if some domains are missing entirely (e.g. step skipped),
  // so an incomplete screening still produces a proportionate score
  // rather than one silently dragged toward zero.
  const combined = weightUsed > 0 ? Math.round(weightedSum / weightUsed) : null;

  const mismatchFlag = computeMismatchFlag(domainScores);

  return {
    xrayAvailable,
    weightsUsed: weights,
    domainScores,
    contributions,
    combinedScore: combined,
    band: combined != null ? bandFromScore(combined) : null,
    mismatchFlag,
  };
}

// Structural-Functional Mismatch Flag: structural damage looks mild/severe
// but functional performance disagrees strongly. Exploratory, non-diagnostic
// — reported alongside the score, not folded into it.
function computeMismatchFlag(domainScores) {
  const { structural, functional } = domainScores;
  if (structural == null || functional == null) return null;
  const diff = Math.abs(structural - functional);
  if (diff >= 40) {
    return {
      triggered: true,
      detail:
        structural > functional
          ? "Structural findings appear more severe than functional performance suggests."
          : "Functional performance appears more impaired than structural findings suggest.",
      diff,
    };
  }
  return { triggered: false, diff };
}
