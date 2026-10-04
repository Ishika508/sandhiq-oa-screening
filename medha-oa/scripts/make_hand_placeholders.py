"""Generate placeholder art for the hand reference gallery.

The real clinical images are supplied later; until then each slot renders a
clearly-labelled placeholder that names its own target file, so the folder can
be filled in without guessing. X-ray and clinical-photo slots are drawn
differently (radiograph greyscale vs skin tone) so a mis-named upload is
obvious at a glance.
"""
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "public", "images", "hand")
OUT = os.path.normpath(OUT)
os.makedirs(OUT, exist_ok=True)

GRADES = [
    # key, label, accent, severity weight
    ("normal", "Normal", "#0d9488", 0),
    ("mild", "Mild", "#0284c7", 1),
    ("moderate", "Moderate", "#b45309", 2),
    ("severe", "Severe", "#b91c1c", 3),
]

W, H = 900, 620


def bones(weight):
    """Radiograph: a stylised hand skeleton. `weight` grows the osteophytes."""
    # Finger chains as jointed capsules; knob size encodes degeneration.
    base = 7 - weight                      # joint radius shrinks as it worsens
    knob = 4 + weight * 6
    gap = 7 - weight * 1.6
    parts = []
    # wrist
    parts.append(f'<ellipse cx="450" cy="540" rx="120" ry="62" fill="#d8d8d4" opacity="0.85"/>')
    for i in range(4):
        x = 330 + i * 80
        top = 250 + abs(i - 1.5) * 34
        parts.append(
            f'<line x1="{x}" y1="540" x2="{x}" y2="{top + 40}" stroke="#e2e2de" '
            f'stroke-width="{base + 16}" stroke-linecap="round" opacity="0.8"/>'
        )
        for j, seg in enumerate((0.36, 0.68)):
            y = top + 40 + (540 - (top + 40)) * seg
            parts.append(
                f'<circle cx="{x}" cy="{y}" r="{base + 9}" fill="#ecece8" opacity="0.9"/>'
            )
        # osteophytes at the DIP/PIP of the longer fingers
        for y in (top + 40, top + 40 + (540 - (top + 40)) * 0.68):
            for sx in (-1, 1):
                parts.append(
                    f'<circle cx="{x + sx * (base + 11)}" cy="{y}" r="{knob}" '
                    f'fill="#f4f4f0" opacity="0.92"/>'
                )
    parts.append(
        f'<line x1="245" y1="560" x2="205" y2="500" stroke="#e2e2de" '
        f'stroke-width="{base + 12}" stroke-linecap="round" opacity="0.75"/>'
    )
    # joint-space narrowing: dark bands across the finger bases
    if weight:
        for i in range(4):
            x = 330 + i * 80
            w = 16 - weight * 4
            parts.append(
                f'<rect x="{x - w}" y="470" width="{w * 2}" height="{16 - weight * 3}" '
                f'fill="#0a0a0a" opacity="{0.5 + weight * 0.15:.2f}"/>'
            )
    return "\n    ".join(parts)


def hand_silhouette(weight):
    """Clinical photo: a hand, with deformity scaling by grade."""
    spread = 6 + weight * 9
    parts = [
        f'<ellipse cx="450" cy="360" rx="150" ry="175" fill="#e8c4a4" opacity="0.95"/>'
    ]
    for i in range(4):
        x = 348 + i * 68
        ang = (i - 1.5) * spread * 0.55
        ln = 150 - abs(i - 1.5) * 22 - weight * 10
        parts.append(
            f'<g transform="rotate({ang:.1f} {x} 330)">'
            f'<rect x="{x - 21}" y="{330 - ln}" width="42" height="{ln}" rx="21" '
            f'fill="#eecfae" opacity="0.95"/></g>'
        )
    # Heberden's nodes on the finger ends, growing with grade
    if weight:
        for i in range(4):
            x = 348 + i * 68
            ang = (i - 1.5) * spread * 0.55
            ln = 150 - abs(i - 1.5) * 22 - weight * 10
            parts.append(
                f'<g transform="rotate({ang:.1f} {x} 330)">'
                f'<circle cx="{x - 24}" cy="{330 - ln + 16}" r="{5 + weight * 5}" '
                f'fill="#d9a880" opacity="0.9"/>'
                f'<circle cx="{x + 24}" cy="{330 - ln + 16}" r="{5 + weight * 5}" '
                f'fill="#d9a880" opacity="0.9"/></g>'
            )
    parts.append(
        f'<ellipse cx="450" cy="548" rx="112" ry="62" fill="#e0b593" opacity="0.95"/>'
    )
    return "\n    ".join(parts)


def write(name, grade, modality, accent, weight):
    # Filenames are always lowercase-slugged, never the display label.
    fname = f"{name}-{modality}.jpg"
    is_xray = modality == "xray"
    bg = ("#0b0b0d" if is_xray else "#1b2027")
    art = bones(weight) if is_xray else hand_silhouette(weight)
    label = "RADIOGRAPH (X-RAY)" if is_xray else "CLINICAL PHOTOGRAPH"
    note = f"Replace public/images/hand/{fname}"
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{grade} {modality} placeholder">
  <defs>
    <radialGradient id="vig" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="{accent}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="{W}" height="{H}" fill="{bg}"/>
  <rect width="{W}" height="{H}" fill="url(#vig)"/>
  <g opacity="0.95">
    {art}
  </g>
  <rect x="0" y="0" width="{W}" height="112" fill="{bg}" opacity="0.82"/>
  <text x="36" y="46" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700">{grade.upper()} &#183; {label}</text>
  <text x="36" y="80" fill="{accent}" font-family="Segoe UI, Arial, sans-serif" font-size="19" font-weight="600">Placeholder — awaiting clinical image</text>
  <rect x="0" y="{H - 76}" width="{W}" height="76" fill="{bg}" opacity="0.86"/>
  <text x="36" y="{H - 40}" fill="#cbd5e1" font-family="Consolas, monospace" font-size="17">{note}</text>
  <text x="36" y="{H - 16}" fill="#64748b" font-family="Segoe UI, Arial, sans-serif" font-size="14">Square-ish crop, min 800 px on the short edge. De-identified, no patient identifiers.</text>
</svg>
'''
    with open(os.path.join(OUT, f"{name}-{modality}.svg"), "w", encoding="utf-8") as fh:
        fh.write(svg)


for key, label, accent, weight in GRADES:
    for modality in ("xray", "hand"):
        write(key, label, modality, accent, weight)
    print(f"  placeholders written for {key}")

print(f"\n{len(os.listdir(OUT))} files in {OUT}")
