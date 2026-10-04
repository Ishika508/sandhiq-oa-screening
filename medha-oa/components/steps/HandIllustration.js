// A simple, schematic (non-photographic) hand illustration used as a
// reference visual for nodal-OA severity grading. Deliberately abstract —
// swap for real clinical reference photographs before field deployment.
export default function HandIllustration({ severity = 0, size = 72 }) {
  const nodeR = [0, 1.6, 2.6, 3.6][severity];
  const jointColor = ["#94a3b8", "#f59e0b", "#f97316", "#e11d48"][severity];
  const fingers = [
    { x: 24, len: 34 }, { x: 34, len: 42 }, { x: 44, len: 44 }, { x: 54, len: 38 }, { x: 62, len: 26 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 84 84" fill="none">
      <path d="M18 78 C14 60 14 46 18 34 L64 34 C68 46 68 60 64 78 Z" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
      {fingers.map((f, i) => (
        <g key={i}>
          <rect x={f.x - 4} y={34 - f.len} width="8" height={f.len} rx="4" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.2" />
          {severity > 0 && (
            <>
              <circle cx={f.x} cy={34 - f.len * 0.35} r={nodeR} fill={jointColor} opacity="0.85" />
              {severity > 1 && <circle cx={f.x} cy={34 - f.len * 0.75} r={nodeR * 0.8} fill={jointColor} opacity="0.7" />}
            </>
          )}
        </g>
      ))}
      {severity > 2 && <circle cx="17" cy="50" r="4.5" fill={jointColor} opacity="0.85" />}
    </svg>
  );
}
