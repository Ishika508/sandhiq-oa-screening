/**
 * Builds the structured clinical report model.
 *
 * Both the on-screen report and the downloadable PDF render from this single
 * object, so the two can never disagree. Anything added here appears in both.
 *
 * The output is deliberately flat and printable: no React, no chart
 * components, no icons — just labels, values and notes.
 */

import { computeBMI, bodySurfaceAreaM2 } from "./bmi";

const DOMAIN_LABELS = {
  structural: "Structural (radiographic)",
  functional: "Functional (movement)",
  biomechanical: "Biomechanical",
  contextual: "Contextual (symptoms & function)",
  handOA: "Hand osteoarthritis",
};

const DOMAIN_SOURCE = {
  structural: "Knee X-ray Kellgren-Lawrence grade",
  functional: "SPPB, TUG and knee range of motion",
  biomechanical: "Wearable IMU vibration / jerk / sway",
  contextual: "WOMAC pain, stiffness and function + FIHOA",
  handOA: "Hand OA checklist + grip dynamometry",
};

function fmt(v, digits = 1, suffix = "") {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return `${Number(v).toFixed(digits)}${suffix}`;
}

function pct(v) {
  return v == null || !Number.isFinite(Number(v)) ? null : `${Number(v).toFixed(0)}%`;
}

/**
 * Formats a 0-1 fraction as a percentage.
 *
 * Needed for the X-ray model confidence, which XrayStep persists as a fraction
 * (`result.confidence * 100` is what the UI displays). Passing 0.81 to pct()
 * would print "1%".
 */
function fracPct(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return `${(Number(v) * 100).toFixed(1)}%`;
}

/**
 * @param {object} params
 * @param {object} params.patient
 * @param {object} params.screening
 * @param {object} params.steps  raw per-step data from getAllSteps()
 * @param {object} params.fusion output of computeFusion()
 * @param {string} [params.clinician]
 */
export function buildReportModel({ patient, screening, steps, fusion, clinician }) {
  const anthropometrics = anthropometricBlock(patient);
  const measurements = measurementRows(steps);
  const domains = domainRows(fusion);
  const findings = deriveFindings(fusion, steps, anthropometrics);
  const recommendations = deriveRecommendations(fusion, steps, anthropometrics);
  const missing = missingTests(steps);

  return {
    meta: {
      title: "Osteoarthritis Screening Report",
      subtitle: "SANDHIQ community screening platform",
      generatedAt: new Date(screening?.updatedAt || Date.now()),
      reportId: `SANDHIQ-${patient?.patientCode || patient?.id || "NA"}-${new Date(
        screening?.updatedAt || Date.now()
      )
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "")}`,
      clinician: clinician || "Screening operator (unsigned)",
    },
    patient: {
      name: patient?.name || "-",
      code: patient?.patientCode || "-",
      age: patient?.age ?? null,
      sex: patient?.sex || "-",
      village: patient?.village || "-",
      phone: patient?.phone || "-",
    },
    anthropometrics,
    impression: {
      score: fusion.combinedScore,
      band: fusion.band,
      xrayAvailable: fusion.xrayAvailable,
      summary: impressionSentence(fusion, anthropometrics),
    },
    mismatch: mismatchBlock(fusion),
    domains,
    measurements,
    findings,
    recommendations,
    completeness: {
      completed: measurements.filter((m) => m.value != null).length,
      total: measurements.length,
      missing,
      xrayAvailable: fusion.xrayAvailable,
    },
    limitations: LIMITATIONS,
    footer:
      "Screening output for clinical follow-up. Not a diagnosis. Confirm with a qualified " +
      "healthcare professional before treatment decisions.",
  };
}

/**
 * Structural vs functional disagreement.
 *
 * fusion.computeMismatchFlag() only fills `detail` on the branch where it
 * actually fires, so a partially-populated fusion object would otherwise render
 * the literal string "undefined". Recompute the wording here and treat the flag
 * as advisory only: only a gap of 40+ points is clinically meaningful.
 */
function mismatchBlock(fusion) {
  const scores = fusion?.domainScores || {};
  const structural = scores.structural;
  const functional = scores.functional;
  if (structural == null || functional == null) {
    return { triggered: false, diff: null, detail: null };
  }
  const diff = Math.abs(structural - functional);
  if (diff < 40) {
    return { triggered: false, diff, detail: null };
  }
  return {
    triggered: true,
    diff,
    detail:
      fusion?.mismatchFlag?.detail ||
      (structural > functional
        ? "Structural findings appear more severe than functional performance suggests."
        : "Functional performance appears more impaired than structural findings suggest."),
  };
}

function anthropometricBlock(patient) {  const h = patient?.heightCm ?? null;
  const w = patient?.weightKg ?? null;
  const { bmi, classification, error } = computeBMI(h, w);
  return {
    heightCm: h,
    weightKg: w,
    bmi,
    bmiLabel: classification?.primary?.label ?? null,
    bmiLabelWhoStandard: classification?.alsoKnownAs?.label ?? null,
    bmiSystem: classification?.system === "asian" ? "WHO Asian-Indian cut-off" : "WHO standard",
    bsa: bodySurfaceAreaM2(h, w),
    missing: !error,
    error,
  };
}

/** One row per individual measurement, for the printable results table. */
function measurementRows(steps = {}) {
  const rows = [];

  // ---- X-ray ----
  const x = steps.xray;
  if (x && !x.skipped && x.klGrade != null) {
    const probs = x.probabilities || null;
    const top = probs ? Math.max(...Object.values(probs)) : x.confidence ?? null;
    const second = probs ? Object.values(probs).sort((a, b) => b - a)[1] : null;
    const ambiguous = second != null && top - second < 0.15;
    // XrayStep stores confidence as a 0-1 fraction, not a percentage.
    const conf = fracPct(x.confidence);
    rows.push({
      group: "Radiographic",
      test: "Knee X-ray (Kellgren-Lawrence grade)",
      value: `KL${x.klGrade}`,
      detail: conf != null ? `model confidence ${conf}${ambiguous ? " (ambiguous)" : ""}` : null,
      note: KL_MEANING[x.klGrade] ?? null,
    });
  } else {
    rows.push({
      group: "Radiographic",
      test: "Knee X-ray (Kellgren-Lawrence grade)",
      value: "Not done",
      detail: null,
      note: "Structural domain excluded; fusion weights rebalanced",
    });
  }

  // ---- CV battery ----
  const cv = steps.cv;
  const sub = cv?.results || {};
  const sppbSub = cv?.sppbBreakdown?.subScores || null;

  const chairTime = sub.chairStand?.total_time_seconds ?? null;
  const chairPts = sppbSub?.chair?.pts ?? null;
  if (cv?.sppbTotal != null || chairTime != null) {
    rows.push({
      group: "Functional",
      test: "SPPB total (chair stand, gait, balance)",
      value: cv.sppbTotal != null ? `${cv.sppbTotal}/${cv.sppbValidMax ?? 12}` : "Incomplete",
      detail:
        cv.sppbPct != null
          ? `${pct(cv.sppbPct)} of valid points · risk band ${cv.sppbBand ?? "-"}`
          : null,
      note: cv.sppbPct != null && cv.sppbPct < 70 ? "Below the 70% independence threshold" : null,
    });
  } else {
    rows.push({ group: "Functional", test: "SPPB total", value: "Not done", detail: null, note: null });
  }

  if (sub.chairStand) {
    const c = sub.chairStand;
    rows.push({
      group: "Functional",
      test: "5-times chair stand",
      value: chairPts != null ? `${chairPts}/4` : c.status === "complete" ? "0/4" : "Incomplete",
      detail: `${c.repetitions ?? 0} reps${c.total_time_seconds != null ? ` in ${fmt(c.total_time_seconds, 1, " s")}` : ""}${
        c.rise_time_mean != null ? ` · ${fmt(c.rise_time_mean, 2, " s/rep")}` : ""
      }`,
      note:
        c.knee_asymmetry_pct != null && c.knee_asymmetry_pct > 20
          ? `Left-right knee asymmetry ${c.knee_asymmetry_pct}%`
          : null,
    });
  }

  if (sub.balance) {
    const b = sub.balance;
    rows.push({
      group: "Functional",
      test: "Quiet stance (balance proxy)",
      value: sppbSub?.balance?.pts != null ? `${sppbSub.balance.pts}/4` : b.status === "complete" ? "0/4" : "Incomplete",
      detail:
        b.rms_sway_cm != null
          ? `sway RMS ${fmt(b.rms_sway_cm, 2, " cm")} over ${fmt(b.held_seconds, 1, " s")}`
          : null,
      note: "Postural-sway proxy, not the SPPB balance item",
    });
  }

  if (sub.gait) {
    const g = sub.gait;
    rows.push({
      group: "Functional",
      test: "4-metre gait speed",
      value: fmt(g.gait_speed_mps, 2, " m/s"),
      detail: g.time_seconds != null ? `${fmt(g.time_seconds, 1, " s")} over 4 m · ${sppbSub?.gait?.pts ?? "-"}/4` : null,
      note: g.gait_speed_mps != null && g.gait_speed_mps < 0.8 ? "Below 0.8 m/s: elevated fall / mobility risk" : null,
    });
    if (g.cadence_steps_per_min != null) {
      rows.push({
        group: "Functional",
        test: "Gait cadence and step length",
        value: `${g.cadence_steps_per_min} steps/min`,
        detail: `${g.step_count ?? "-"} steps counted${g.step_length_m != null ? ` · step length ${fmt(g.step_length_m, 2, " m")}` : ""} · timed ${g.timing_basis ?? "-"}`,
        note: "Camera-derived. Step count feeds cadence and length only, never the time-based SPPB score.",
      });
    }
  }

  if (sub.tug) {
    const t = sub.tug;
    rows.push({
      group: "Functional",
      test: "Timed up and go",
      value: fmt(t.seconds, 1, " s"),
      detail: t.band ? `${t.band} mobility band` : null,
      note: t.seconds != null && t.seconds > 13.5 ? "Above the 13.5 s cut-off" : null,
    });
  }

  if (sub.rom) {
    rows.push({
      group: "Functional",
      test: "Knee range of motion",
      value: fmt(sub.rom.flexionRange, 0, "°"),
      detail:
        sub.rom.minAngle != null
          ? `${fmt(sub.rom.minAngle, 0, "°")} to ${fmt(sub.rom.maxAngle, 0, "°")} flexion`
          : null,
      note: "Flexion arc captured during the seated test",
    });
  }

  // ---- Symptoms ----
  const w = steps.womac?.scored;
  if (w) {
    rows.push({
      group: "Symptoms",
      test: "WOMAC",
      value: pct(w.totalPct),
      detail: `pain ${w.painScore ?? "-"}/20 · stiffness ${w.stiffnessScore ?? "-"}/8 · function ${w.functionScore ?? "-"}/68`,
      note: w.totalPct != null && w.totalPct > 50 ? "Symptom burden above half scale" : null,
    });
  } else {
    rows.push({ group: "Symptoms", test: "WOMAC", value: "Not done", detail: null, note: null });
  }

  const f = steps.fihoa?.scored;
  if (f) {
    rows.push({
      group: "Symptoms",
      test: "FIHOA (hand function)",
      value: pct(f.totalPct),
      detail: null,
      note: null,
    });
  }

  // ---- Biomechanical ----
  const imu = steps.imu;
  if (imu && imu.riskScore != null) {
    rows.push({
      group: "Biomechanical",
      test: "IMU vibroarthrography",
      value: `${imu.riskScore}/100`,
      detail:
        imu.vibrationAmp != null
          ? `amp ${fmt(imu.vibrationAmp, 3)} · jerk ${fmt(imu.jerk, 2)} · sway ${fmt(imu.sway, 2)}`
          : null,
      note: imu.mode === "simulated" ? "Simulated input, not a wearable measurement" : null,
    });
  } else {
    rows.push({ group: "Biomechanical", test: "IMU vibroarthrography", value: "Not done", detail: null, note: null });
  }

  // ---- Hand ----
  // HandStep persists { nodalSeverity: 0-3, notes, method }.
  const hand = steps.hand;
  if (hand && hand.nodalSeverity != null) {
    rows.push({
      group: "Hand",
      test: "Hand OA involvement",
      value: NODAL_LABEL[hand.nodalSeverity] ?? `Grade ${hand.nodalSeverity}`,
      detail: hand.notes ? String(hand.notes).slice(0, 120) : null,
      note: hand.nodalSeverity >= 1 ? "Polyarticular OA raises the systemic OA likelihood" : null,
    });
  }
  // GripStep persists { mode, manualKg, sensorValue, gripKg, gripBand }.
  const grip = steps.grip;
  if (grip && grip.gripKg != null) {
    rows.push({
      group: "Hand",
      test: "Grip strength",
      value: fmt(grip.gripKg, 1, " kg"),
      detail: grip.gripBand ? `${grip.gripBand} band · ${grip.mode === "sensor" ? "dynamometer" : "manual"}` : null,
      note: null,
    });
  }

  return rows;
}

const KL_MEANING = [
  "No radiographic osteoarthritis",
  "Doubtful / very early change",
  "Mild",
  "Moderate",
  "Severe",
];

const NODAL_LABEL = {
  0: "No visible nodes",
  1: "Mild nodal changes",
  2: "Moderate nodal changes",
  3: "Severe nodal changes",
};

function domainRows(fusion) {
  // A screening can be finalised with only some tests done, and older records
  // may predate a domain, so treat every one of these as optional.
  const scores = fusion?.domainScores || {};
  const contributions = fusion?.contributions || {};
  const weightsUsed = fusion?.weightsUsed || {};
  return Object.entries(scores).map(([key, score]) => {
    const c = contributions[key];
    return {
      key,
      label: DOMAIN_LABELS[key] || key,
      source: DOMAIN_SOURCE[key] || "",
      score,
      weight: weightsUsed[key] ?? 0,
      contribution: c?.contribution ?? null,
      status: score == null ? "Not completed" : "Scored",
    };
  });
}

function impressionSentence(fusion, anth) {
  if (fusion.combinedScore == null) {
    return "Insufficient data to produce a combined screening score.";
  }
  const band = fusion.band?.label ?? "Unclassified";
  const parts = [];
  parts.push(
    `Composite screening score ${fusion.combinedScore}/100, corresponding to ${band.toLowerCase()} overall risk.`
  );

  const scored = Object.entries(fusion.domainScores).filter(([, v]) => v != null);
  if (scored.length) {
    const worst = scored.sort((a, b) => b[1] - a[1])[0];
    parts.push(
      `The most impaired domain is ${DOMAIN_LABELS[worst[0]] || worst[0]} at ${worst[1]}/100.`
    );
  }
  if (!fusion.xrayAvailable) {
    parts.push("No radiograph was available, so structural evidence is absent and the remaining domains carry full weight.");
  }
  if (anth.bmi != null) {
    const tone = anth.bmi >= 27.5 ? "which adds to knee loading" : anth.bmi < 18.5 ? "which may reflect low muscle mass" : null;
    if (tone) parts.push(`BMI is ${anth.bmi} (${anth.bmiLabel}), ${tone}.`);
  }
  const mm = mismatchBlock(fusion);
  if (mm.triggered) {
    parts.push(mm.detail);
  }
  return parts.join(" ");
}

function deriveFindings(fusion, steps, anth) {
  const out = [];
  const add = (severity, text) => out.push({ severity, text });

  if (fusion.xrayAvailable && steps.xray.klGrade >= 3) {
    add("major", `Radiographic knee OA is ${KL_MEANING[steps.xray.klGrade].toLowerCase()} (KL${steps.xray.klGrade}).`);
  } else if (fusion.xrayAvailable && steps.xray.klGrade === 2) {
    add("major", "Radiographic knee OA is mild (KL2).");
  } else if (fusion.xrayAvailable) {
    add("minor", `Radiographic knee OA grade is KL${steps.xray.klGrade}; no definite structural change.`);
  } else {
    add("minor", "Structural status unknown - no radiograph was taken.");
  }

  const cv = steps.cv;
  const g = cv?.results?.gait;
  if (g?.gait_speed_mps != null && g.gait_speed_mps < 0.8) {
    add("major", `Gait speed ${fmt(g.gait_speed_mps, 2, " m/s")} is below the 0.8 m/s threshold associated with poor mobility and falls.`);
  }
  if (cv?.sppbPct != null && cv.sppbPct < 70) {
    add("major", `SPPB performance at ${pct(cv.sppbPct)} of valid points is below the 70% cut-off for low mobility.`);
  }
  const tug = cv?.results?.tug;
  if (tug?.seconds != null && tug.seconds > 13.5) {
    add("major", `Timed up and go at ${fmt(tug.seconds, 1, " s")} exceeds the 13.5 s cut-off.`);
  }
  const chair = cv?.results?.chairStand;
  if (chair?.total_time_seconds != null && chair.total_time_seconds > 16.7) {
    add("major", `Five chair stands took ${fmt(chair.total_time_seconds, 1, " s")}, slower than the 16.7 s reference.`);
  }
  if (chair?.knee_asymmetry_pct != null && chair.knee_asymmetry_pct > 20) {
    add("minor", `Left-right knee rise time differs by ${chair.knee_asymmetry_pct}%, suggesting asymmetric loading.`);
  }
  if (cv?.results?.rom?.flexionRange != null && cv.results.rom.flexionRange < 100) {
    add("minor", `Knee flexion arc of ${fmt(cv.results.rom.flexionRange, 0, "°")} is reduced, which limits stairs, squatting and sitting.`);
  }

  const w = steps.womac?.scored;
  if (w && w.totalPct != null && w.totalPct > 50) {
    add("major", `WOMAC burden is ${pct(w.totalPct)} of the maximum, indicating significant pain, stiffness and functional limitation.`);
  }
  if (w?.painScore != null && w.painScore >= 10) {
    add("major", `Reported pain scores ${w.painScore}/20 on the WOMAC pain subscale.`);
  }

  if (steps.imu?.mode === "simulated") {
    add("minor", "Biomechanical scores came from simulated input rather than a wearable sensor.");
  }

  if (anth.bmi != null && anth.bmi >= 27.5) {
    add("major", `BMI ${anth.bmi} (${anth.bmiLabel} by ${anth.bmiSystem}) - excess body weight increases medial knee loading and accelerates OA progression.`);
  } else if (anth.bmi != null && anth.bmi < 18.5) {
    add("minor", `BMI ${anth.bmi} is in the underweight range; low muscle mass can worsen joint function.`);
  }

  const mm = mismatchBlock(fusion);
  if (mm.triggered) {
    add("major", `Structural and functional findings disagree by ${mm.diff} points: ${mm.detail}`);
  }

  if (!out.length) add("minor", "No findings met the reporting thresholds for this screening.");
  return out;
}

function deriveRecommendations(fusion, steps, anth) {
  const out = [];
  const add = (who, text) => out.push({ who, text });

  const band = fusion.band?.label;
  if (band === "High") {
    add("Priority", "Refer to an orthopaedic or rheumatology clinic for imaging and specialist management.");
  } else if (band === "Moderate") {
    add("Priority", "Book a clinical review within 3 months; consider a repeat screening after any intervention.");
  } else {
    add("Priority", "Routine 6-12 month re-screening; reinforce preventive activity advice.");
  }

  if (fusion.xrayAvailable && steps.xray.klGrade >= 2) {
    add("Imaging", `Radiographic change is present (KL${steps.xray.klGrade}); weight-bearing knee radiographs are the reference standard and should be reviewed by a radiologist.`);
  } else if (!fusion.xrayAvailable) {
    add("Imaging", "Obtain a weight-bearing knee radiograph to establish the structural baseline.");
  }

  if (anth.bmi != null && anth.bmi >= 27.5) {
    add("Weight", `Reduce body weight where possible - even 5% loss measurably reduces knee pain and improves function.`);
  } else if (anth.bmi != null && anth.bmi < 18.5) {
    add("Weight", "Refer for nutritional assessment; low BMI in an older adult warrants sarcopenia screening.");
  }

  const g = steps.cv?.results?.gait;
  if (g?.gait_speed_mps != null && g.gait_speed_mps < 0.8) {
    add("Mobility", "Supervised gait and balance training; consider an assistive device and home fall-hazard review.");
  }
  if (steps.cv?.sppbPct != null && steps.cv.sppbPct < 70) {
    add("Mobility", "Structured lower-limb strengthening three times weekly has good evidence for SPPB improvement.");
  }
  if (steps.cv?.results?.rom?.flexionRange != null && steps.cv.results.rom.flexionRange < 100) {
    add("Mobility", "Daily knee range-of-motion exercises; consider physiotherapy referral if flexion stays restricted.");
  }

  if (steps.womac?.scored?.totalPct > 50 || steps.womac?.scored?.painScore >= 10) {
    add("Pain", "Pain is the main limiting factor - assess analgesic options with a clinician before any activity increase.");
  }

  add("Activity", "Low-impact activity such as walking, cycling or swimming most days of the week is recommended for knee OA.");
  add("Follow-up", "Re-screen at the interval advised by the reviewing clinician and record any change in symptoms.");
  return out;
}

function missingTests(steps = {}) {
  const missing = [];
  if (!steps.xray || steps.xray.skipped || steps.xray.klGrade == null) missing.push("Knee X-ray");
  const cv = steps.cv;
  if (!cv || cv.sppbPct == null) missing.push("SPPB / gait / balance battery");
  if (!steps.womac?.scored) missing.push("WOMAC");
  if (!steps.imu || steps.imu.riskScore == null) missing.push("IMU biomechanical");
  if (!steps.hand && !steps.grip) missing.push("Hand OA / grip");
  return missing;
}

const LIMITATIONS = [
  "Camera-derived movement measures (gait, balance, range of motion) are vision-based proxies, not instrumented measurements, and are most reliable when the subject is fully in frame under even lighting.",
  "The 4-metre gait speed is timed from the first to the last detected step once four or more steps are seen, which removes operator reaction delay.",
  "Step count feeds cadence and step length only. It never influences the time-based SPPB gait score.",
  "The X-ray grade comes from an EfficientNet-B0 model that achieved 60.6% accuracy on 1,656 held-out radiographs, with KL1 recall of only 7.4%. It systematically under-reports early disease and must be confirmed by a radiologist.",
  "Risk bands (low <30, moderate 30-64, high >=65) and fusion weights are provisional and require calibration against clinical outcomes.",
  "Force-test and IMU scores depend on the respective hardware being connected; confirm every stored reading against the source device before clinical use.",
];

export { DOMAIN_LABELS, DOMAIN_SOURCE };
