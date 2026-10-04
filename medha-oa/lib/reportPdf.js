/**
 * Standardised PDF report generation.
 *
 * Renders the shared report model into a hospital-style document: letterhead,
 * patient identity block, results tables, findings, recommendations, signature
 * block and limitations.
 *
 * Everything is generated programmatically, so the app chrome — sidebar,
 * floating assistant widget, navigation — cannot leak into the output the way
 * it does with a browser "Print to PDF". Patient data never leaves the device:
 * jsPDF runs in the browser and nothing is uploaded.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const BRAND = [2, 132, 199];
const TEAL = [13, 148, 136];

const BAND_COLOR = {
  Low: [5, 150, 105],
  Moderate: [217, 119, 6],
  High: [220, 38, 38],
};

const SEVERITY_COLOR = {
  major: [190, 24, 93],
  minor: [146, 64, 14],
};

/** Font sizes tried in order when a value has to be fitted into a fixed cell. */
const SIZES = [9.5, 8.8, 8.1, 7.4];

/** Wraps text to a column width. */
function wrap(doc, text, width) {
  return doc.splitTextToSize(String(text ?? ""), width);
}

/** Simple flowing text writer. Returns the new y. */
function flow(doc, text, x, y, width, opts = {}) {
  const { size = 9, style = "normal", color = INK, lineGap = 1.2, maxY = 280 } = opts;
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = wrap(doc, text, width);
  for (const line of lines) {
    if (y > maxY) return y;
    doc.text(line, x, y);
    y += size * lineGap;
  }
  return y;
}

function sectionHeading(doc, title, y, pageWidth, margins) {
  const { left, right } = margins;
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.8);
  doc.line(left, y + 1.5, left, y - 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(String(title).toUpperCase(), left + 3.2, y - 1);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(left, y + 2.5, pageWidth - right, y + 2.5);
  return y + 8;
}

export function buildPdf(model, { clinician, facility } = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margins = { left: 16, right: 16, top: 14, bottom: 16 };
  const contentW = pageWidth - margins.left - margins.right;
  const right = pageWidth - margins.right;

  const fac = facility || { name: "SANDHIQ Screening Programme", unit: "Community Osteoarthritis Screening Unit" };
  let y = margins.top;

  // ---------------------------------------------------------------- letterhead
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setFillColor(...TEAL);
  doc.rect(0, 26, pageWidth, 1.6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(fac.name, margins.left, 11.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(219, 234, 254);
  doc.text(fac.unit, margins.left, 16.5);
  doc.text("Community screening - not a diagnostic service", margins.left, 20.5);

  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("REPORT ID", right, 11.5, { align: "right" });
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text(model.meta.reportId, right, 16.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(219, 234, 254);
  doc.text(
    `Generated ${model.meta.generatedAt.toLocaleString()}`,
    right,
    20.5,
    { align: "right" }
  );

  y = 36;

  // ---------------------------------------------------------------- title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(model.meta.title, margins.left, y);
  y += 6;

  // ---------------------------------------------------------------- patient
  const p = model.patient;
  const a = model.anthropometrics;
  const boxTop = y;
  const ROW_H = 14;
  const boxH = 45;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.roundedRect(margins.left, boxTop, contentW, boxH, 2, 2, "FD");

  const colW = contentW / 4;
  // `row` is required: the box holds several rows of fields, and drawing them
  // all at one y printed the anthropometric values on top of the identity
  // values, so "Not recorded" landed on top of the patient's name.
  //
  // A value is stepped down through SIZES until it fits `maxLines`, so a long
  // name shrinks instead of being silently truncated.
  const drawField = (x, top, label, value, maxW, maxLines) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(String(label).toUpperCase(), x, top);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    const v = value == null || value === "" ? "-" : String(value);
    let size = SIZES[0];
    let lines = [];
    for (const candidate of SIZES) {
      doc.setFontSize(candidate);
      lines = doc.splitTextToSize(v, maxW);
      size = candidate;
      if (lines.length <= maxLines) break;
    }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, "") + ".";
    }
    doc.setFontSize(size);
    doc.text(lines, x, top + 5.5);
  };

  const cell = (row, i, label, value) =>
    drawField(margins.left + colW * i + 3, boxTop + 5 + row * ROW_H, label, value, colW - 6, 2);

  // Village and contact get the full page width on their own line. They are the
  // only free-text fields, and in a 44 mm column a long village name pushed the
  // phone number out of the box entirely.
  const contact = [p.village, p.phone].filter(Boolean).join("  \u00b7  ");
  drawField(margins.left + 3, boxTop + 5 + 2 * ROW_H, "Village / Contact", contact, contentW - 6, 2);

  cell(0, 0, "Patient name", p.name);
  cell(0, 1, "Patient ID", p.code);
  cell(0, 2, "Age", p.age != null ? `${p.age} years` : null);
  cell(0, 3, "Sex", p.sex);

  cell(1, 0, "Height", a.heightCm != null ? `${a.heightCm} cm` : null);
  cell(1, 1, "Weight", a.weightKg != null ? `${a.weightKg} kg` : null);
  cell(1, 2, "BMI", a.bmi != null ? `${a.bmi} (${a.bmiLabel})` : null);
  cell(1, 3, "Body surface area", a.bsa != null ? `${a.bsa} m²` : null);

  y = boxTop + boxH + 7;

  // Height and weight are compulsory at registration, so a record without them
  // is a legacy one. Say so once, plainly, instead of implying the patient has
  // no measurements on file.
  if (a.heightCm == null || a.weightKg == null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      "Note: height and weight were not captured for this record, so BMI could not be calculated.",
      margins.left,
      y - 3.5
    );
    y += 2;
  }

  // ---------------------------------------------------------------- impression
  const imp = model.impression;
  const impH = 30;
  const bandCol = BAND_COLOR[imp.band?.label] || MUTED;
  doc.setFillColor(...bandCol);
  doc.roundedRect(margins.left, y, contentW, impH, 2, 2, "F");

  // The three band columns are positioned from measured text widths. Fixed
  // offsets left only 29 mm for a 42 mm heading, so "COMPOSITE SCREENING SCORE"
  // printed straight through the "RISK BAND" label beside it.
  const PAD = 5;
  const GAP = 4;
  const widthOf = (text, size, style = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    return doc.getTextWidth(text);
  };

  const scoreLabel = "COMPOSITE SCREENING SCORE";
  const scoreText = imp.score != null ? String(imp.score) : "--";
  const denom = "/ 100";
  const badgeLabel = "RISK BAND";
  const bandText = imp.band?.label || "Not scored";
  const note = imp.xrayAvailable
    ? "Radiographic evidence included"
    : "No radiograph - weights rebalanced";

  const col1W = Math.max(
    widthOf(scoreLabel, 7.5),
    widthOf(scoreText, 22, "bold"),
    widthOf(denom, 7.5)
  );
  // Cap the middle column so a long band name cannot squeeze out the summary.
  const col2W = Math.min(
    52,
    Math.max(
      widthOf(badgeLabel, 7.5),
      widthOf(bandText, 13, "bold"),
      widthOf(note, 6.5)
    )
  );

  const x0 = margins.left + PAD;
  const x1 = x0 + col1W + GAP;
  const x2 = x1 + col2W + GAP;
  const sumW = margins.left + contentW - PAD - x2;

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(scoreLabel, x0, y + 9);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(scoreText, x0, y + 21);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(denom, x0, y + 27);

  doc.setFontSize(7.5);
  doc.text(badgeLabel, x1, y + 9);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(bandText, x1, y + 20);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(note, col2W), x1, y + 26);

  doc.setFontSize(7.5);
  doc.text("CLINICAL SUMMARY", x2, y + 9);
  doc.setFontSize(8);
  doc.text(wrap(doc, imp.summary, sumW), x2, y + 14.5);

  y += impH + 9;

  // ---------------------------------------------------------------- domains
  y = sectionHeading(doc, "Domain scores and weighting", y, pageWidth, margins);
  autoTable(doc, {
    startY: y,
    margin: { left: margins.left, right: margins.right },
    head: [["Domain", "Evidence source", "Score", "Weight", "Contribution"]],
    body: model.domains.map((d) => [
      d.label,
      d.source,
      d.score != null ? `${d.score} / 100` : "Not completed",
      `${Math.round(d.weight * 100)}%`,
      d.contribution != null ? d.contribution.toFixed(1) : "-",
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.15 },
    headStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [252, 253, 254] },
    columnStyles: {
      0: { cellWidth: 44, fontStyle: "bold" },
      2: { halign: "right", cellWidth: 20 },
      3: { halign: "right", cellWidth: 14 },
      // 20 mm was too narrow for the header, so "Contribution" wrapped and
      // broke mid-word as "Contributio" / "n".
      4: { halign: "right", cellWidth: 25 },
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ---------------------------------------------------------------- measurements
  if (y > pageHeight - 60) {
    doc.addPage();
    y = margins.top;
  }
  y = sectionHeading(doc, "Detailed measurements", y, pageWidth, margins);
  autoTable(doc, {
    startY: y,
    margin: { left: margins.left, right: margins.right },
    head: [["Test", "Result", "Detail", "Interpretation"]],
    body: model.measurements.map((m) => [
      m.test,
      m.value ?? "-",
      m.detail ?? "",
      m.note ?? "",
    ]),
    theme: "grid",
    styles: { fontSize: 7.6, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.15 },
    headStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: "bold", fontSize: 7.8 },
    alternateRowStyles: { fillColor: [252, 253, 254] },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold" },
      1: { cellWidth: 24 },
      2: { cellWidth: 48 },
    },
    didParseCell: (hook) => {
      // "Not done" rows are visually de-emphasised.
      if (hook.section === "body" && String(hook.cell.raw).match(/^(Not done|Incomplete)/i)) {
        hook.cell.styles.textColor = MUTED;
        hook.cell.styles.fontStyle = "italic";
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ---------------------------------------------------------------- findings
  if (y > pageHeight - 70) {
    doc.addPage();
    y = margins.top;
  }
  y = sectionHeading(doc, "Key findings", y, pageWidth, margins);
  for (const f of model.findings) {
    if (y > pageHeight - 24) {
      doc.addPage();
      y = margins.top;
    }
    const col = SEVERITY_COLOR[f.severity] || INK;
    doc.setFillColor(...col);
    doc.circle(margins.left + 1.6, y - 1.1, 1.1, "F");
    y = flow(doc, f.text, margins.left + 5.5, y, contentW - 5.5, {
      size: 8.4,
      color: INK,
      maxY: pageHeight - 20,
    });
    y += 1.4;
  }
  y += 3;

  // ---------------------------------------------------------------- recommendations
  if (y > pageHeight - 60) {
    doc.addPage();
    y = margins.top;
  }
  y = sectionHeading(doc, "Recommendations", y, pageWidth, margins);
  for (const r of model.recommendations) {
    if (y > pageHeight - 24) {
      doc.addPage();
      y = margins.top;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(...BRAND);
    doc.text(String(r.who).toUpperCase(), margins.left, y);
    y = flow(doc, r.text, margins.left + 30, y, contentW - 30, {
      size: 8.4,
      maxY: pageHeight - 20,
    });
    y += 1.2;
  }
  y += 3;

  // ---------------------------------------------------------------- limitations
  if (y > pageHeight - 55) {
    doc.addPage();
    y = margins.top;
  }
  y = sectionHeading(doc, "Method and limitations", y, pageWidth, margins);
  for (const lim of model.limitations) {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = margins.top;
    }
    y = flow(doc, `•  ${lim}`, margins.left, y, contentW, {
      size: 7.4,
      color: MUTED,
      maxY: pageHeight - 18,
    });
    y += 0.8;
  }

  // ---------------------------------------------------------------- signature
  if (y > pageHeight - 40) {
    doc.addPage();
    y = margins.top;
  }
  y += 8;
  const sigY = y;
  const halfW = contentW / 2;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(margins.left, sigY, margins.left + halfW - 10, sigY);
  doc.line(margins.left + halfW + 10, sigY, right, sigY);
  doc.setFontSize(7.6);
  doc.setTextColor(...INK);
  doc.text("Screening operator signature", margins.left, sigY + 4);
  doc.text("Reviewing clinician signature & stamp", margins.left + halfW + 10, sigY + 4);
  doc.setFontSize(6.8);
  doc.setTextColor(...MUTED);
  doc.text(clinician || model.meta.clinician, margins.left, sigY + 7.6);
  doc.text("Date: ______________________", margins.left + halfW + 10, sigY + 7.6);

  // ---------------------------------------------------------------- footers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const fy = pageHeight - 8;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(margins.left, fy - 3.5, right, fy - 3.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(...MUTED);
    doc.text(model.footer, margins.left, fy, { maxWidth: contentW - 26 });
    doc.text(`Page ${i} of ${pages}`, right, fy, { align: "right" });
  }

  return doc;
}

export function reportFileName(model) {
  const safe = String(model.patient.name || "patient").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const d = model.meta.generatedAt;
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `SANDHIQ-report-${safe}-${stamp}.pdf`;
}

export function downloadReportPdf(model, opts) {
  const doc = buildPdf(model, opts);
  doc.save(reportFileName(model));
}
