/** Semicircular gauge for market mood in [-100, 100]. Server-rendered SVG. */
export function MoodGauge({ value, change }: { value: number | null; change: number | null }) {
  const v = value === null ? 0 : Math.max(-100, Math.min(100, value));
  const angle = Math.PI * (1 - (v + 100) / 200); // π (left, -100) → 0 (right, +100)
  const cx = 110;
  const cy = 104;
  const r = 86;
  const nx = cx + (r - 12) * Math.cos(angle);
  const ny = cy - (r - 12) * Math.sin(angle);
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - (from + 100) / 200);
    const a1 = Math.PI * (1 - (to + 100) / 200);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  const label = value === null ? "No data" : v >= 15 ? "Positive" : v <= -15 ? "Negative" : "Neutral";
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 220 124" className="w-full max-w-[260px]" role="img" aria-label={`Market mood ${value === null ? "unavailable" : value.toFixed(1)} on a scale from minus 100 to plus 100 (${label})`}>
        <path d={arc(-100, -15)} stroke="#ef7066" strokeWidth="14" fill="none" opacity="0.75" />
        <path d={arc(-15, 15)} stroke="#94a2b8" strokeWidth="14" fill="none" opacity="0.55" />
        <path d={arc(15, 100)} stroke="#45c08f" strokeWidth="14" fill="none" opacity="0.75" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#e7ebf2" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="#e7ebf2" />
        <text x="18" y="122" fill="#94a2b8" fontSize="10">−100</text>
        <text x="188" y="122" fill="#94a2b8" fontSize="10">+100</text>
      </svg>
      <figcaption className="-mt-1 text-center">
        <span className="num block text-3xl font-bold">{value === null ? "—" : (value > 0 ? "+" : "") + value.toFixed(1)}</span>
        <span className="text-xs text-muted">
          {label}
          {change !== null ? `, ${change > 0 ? "+" : ""}${change.toFixed(1)} over window` : ""}
        </span>
      </figcaption>
    </figure>
  );
}
