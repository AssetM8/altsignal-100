/** Client-safe formatting helpers. */
export function fmtCap(usd: number): string {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9) return `$${Math.round(usd / 1e9)}B`;
  return `$${Math.round(usd / 1e6)}M`;
}

export function fmtNum(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

export function fmtSigned(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s;
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export const SOURCE_LABEL: Record<string, string> = {
  reddit: "Reddit",
  hackernews: "Hacker News",
  wikipedia: "Wikipedia",
  search: "Search interest",
  github: "GitHub",
  cross: "Cross-source",
};

export const SOURCE_COLOR: Record<string, string> = {
  reddit: "#e8ad45",
  hackernews: "#ef7066",
  wikipedia: "#48bfe0",
  search: "#a592f0",
  github: "#45c08f",
};

export const ANOMALY_LABEL: Record<string, string> = {
  attention_spike: "Attention spike",
  attention_drop: "Attention drop",
  sentiment_shift: "Sentiment shift",
  hype: "Hype risk",
  divergence: "Source divergence",
  product_divergence: "Product vs investment split",
};

/** Diverging tint for a value in [-1, 1]; returns an rgba() background. */
export function divergingTint(v: number | null | undefined, alpha = 0.55): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "transparent";
  const c = Math.max(-1, Math.min(1, v));
  const a = Math.abs(c) * alpha;
  return c >= 0 ? `rgba(69,192,143,${a.toFixed(3)})` : `rgba(239,112,102,${a.toFixed(3)})`;
}

export function toCsv(rows: Record<string, unknown>[], header: string[], preamble: string[] = []): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join(";") : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  // Guard against CSV formula injection when opened in spreadsheets.
  const safe = (v: unknown) => {
    const s = esc(v);
    return /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  };
  return [...preamble.map((p) => `# ${p}`), header.join(","), ...rows.map((r) => header.map((h) => safe(r[h])).join(","))].join("\n");
}
