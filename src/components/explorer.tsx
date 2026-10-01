"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { StockRow } from "@/lib/services/views";
import { HypeTag, ScoreCell, Signed } from "@/components/ui";
import { SOURCE_LABEL, fmtCap, fmtNum, toCsv } from "@/lib/format";

type ColKey =
  | "rank" | "ticker" | "name" | "sector" | "marketCapUsd" | "score" | "attention" | "sentiment" | "attentionAcceleration"
  | "agreement" | "divergence" | "confidence" | "scoreChange" | "freshnessDays" | "hypeRisk" | "sources";

const COLUMNS: { key: ColKey; label: string; numeric?: boolean; title?: string }[] = [
  { key: "rank", label: "Rank", numeric: true, title: "Market-cap rank in the universe snapshot" },
  { key: "ticker", label: "Ticker" },
  { key: "name", label: "Company" },
  { key: "sector", label: "Sector" },
  { key: "marketCapUsd", label: "Mkt cap", numeric: true },
  { key: "score", label: "Alt score", numeric: true, title: "Alternative Signal Score, 0–100, 50 = neutral" },
  { key: "attention", label: "Attention", numeric: true, title: "0–100, 50 = normal for this company" },
  { key: "sentiment", label: "Sentiment", numeric: true, title: "−100 to +100" },
  { key: "attentionAcceleration", label: "Attn. accel. σ", numeric: true },
  { key: "agreement", label: "Agreement", numeric: true },
  { key: "divergence", label: "Divergence", numeric: true },
  { key: "confidence", label: "Confidence", numeric: true },
  { key: "scoreChange", label: "Score Δ", numeric: true, title: "Change in score over the selected window" },
  { key: "freshnessDays", label: "Data age (d)", numeric: true, title: "Age in days of the oldest source input used today" },
  { key: "hypeRisk", label: "Hype risk" },
  { key: "sources", label: "Sources" },
];

const PRESETS = {
  none: { label: "No preset" },
  bullish: { label: "Bullish" },
  bearish: { label: "Bearish" },
  unusual: { label: "Unusual attention" },
  divergent: { label: "Divergent sources" },
} as const;
type Preset = keyof typeof PRESETS;

const PAGE = 25;
const HYPE_ORDER = { low: 0, elevated: 1, high: 2 } as const;

export function Explorer({ rows, sectors, window, source, isSynthetic, asOf }: { rows: StockRow[]; sectors: string[]; window: number; source: string; isSynthetic: boolean; asOf: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const initialPreset = (sp.get("preset") as Preset) in PRESETS ? (sp.get("preset") as Preset) : "none";
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("all");
  const [minConf, setMinConf] = useState(0);
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [hype, setHype] = useState<"any" | "elevated+">("any");
  const [range, setRange] = useState({ scoreMin: "", scoreMax: "", attnMin: "", sentMin: "", sentMax: "" });
  const [sort, setSort] = useState<{ key: ColKey; dir: 1 | -1 }>(defaultSort(initialPreset));
  const [hidden, setHidden] = useState<Set<ColKey>>(new Set(["freshnessDays", "sources", "divergence"]));
  const [page, setPage] = useState(0);

  const setUrl = (k: string, v: string, d: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v === d) n.delete(k); else n.set(k, v);
    router.replace(`${path}${n.size ? `?${n}` : ""}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const num = (x: string) => (x.trim() === "" ? null : Number(x));
    const r = range;
    let list = rows.filter((row) => {
      if (s && !row.ticker.toLowerCase().includes(s) && !row.name.toLowerCase().includes(s)) return false;
      if (sector !== "all" && row.sector !== sector) return false;
      if (row.confidence < minConf) return false;
      if (hype === "elevated+" && row.hypeRisk === "low") return false;
      const sMin = num(r.scoreMin), sMax = num(r.scoreMax), aMin = num(r.attnMin), seMin = num(r.sentMin), seMax = num(r.sentMax);
      if (sMin !== null && (row.score ?? -Infinity) < sMin) return false;
      if (sMax !== null && (row.score ?? Infinity) > sMax) return false;
      if (aMin !== null && (row.attention ?? -Infinity) < aMin) return false;
      if (seMin !== null && (row.sentiment ?? -Infinity) < seMin) return false;
      if (seMax !== null && (row.sentiment ?? Infinity) > seMax) return false;
      if (preset === "bullish") return (row.score ?? 0) >= 55 && row.confidence >= 50;
      if (preset === "bearish") return (row.score ?? 100) <= 45 && row.confidence >= 50;
      if (preset === "unusual") return (row.attention ?? 0) >= 90 || (row.anomalyScore ?? 0) >= 95;
      if (preset === "divergent") return (row.divergence ?? 0) >= 60;
      return true;
    });
    const k = sort.key;
    list = [...list].sort((a, b) => {
      const va = k === "hypeRisk" ? HYPE_ORDER[a.hypeRisk] : k === "sources" ? a.sourcesAvailable.length : (a[k as keyof StockRow] as number | string | null);
      const vb = k === "hypeRisk" ? HYPE_ORDER[b.hypeRisk] : k === "sources" ? b.sourcesAvailable.length : (b[k as keyof StockRow] as number | string | null);
      if (va === null || va === undefined) return 1; // missing always last
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "string") return va.localeCompare(vb as string) * sort.dir;
      return ((va as number) - (vb as number)) * sort.dir;
    });
    return list;
  }, [rows, q, sector, minConf, hype, range, preset, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const visible = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const cols = COLUMNS.filter((c) => !hidden.has(c.key));

  const exportCsv = () => {
    const header = ["rank", "ticker", "name", "sector", "industry", "marketCapUsd", "score", "attention", "sentiment", "attentionAcceleration", "sentimentChange", "agreement", "divergence", "confidence", "anomalyScore", "hypeRisk", "scoreChange", "freshnessDays", "sourcesAvailable"];
    const csv = toCsv(filtered as unknown as Record<string, unknown>[], header, [
      `AltSignal 100 export, data as of ${asOf} (UTC), window ${window}d, source ${source}`,
      isSynthetic ? "DEMO DATA: synthetic fixtures, not real observations" : "Live alternative data; see DATA_SOURCES.md for licensing",
      "Research and educational use only. Not investment advice.",
    ]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `altsignal100-${isSynthetic ? "DEMO-" : ""}${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sortBtn = (c: (typeof COLUMNS)[number]) => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((s.dir * -1) as 1 | -1) : c.numeric ? -1 : 1 }))}
      className="inline-flex items-center gap-1 hover:text-fg"
      title={c.title}
    >
      {c.label}
      <span aria-hidden="true" className="text-faint">{sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
    </button>
  );
  const input = "w-16 border border-line bg-ink px-1.5 py-1 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 border border-line bg-panel p-3">
        <label className="flex flex-col gap-1 text-2xs text-muted">
          Search
          <input data-testid="explorer-search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Ticker or name" className="w-44 border border-line bg-ink px-2 py-1 text-sm text-fg" />
        </label>
        <label className="flex flex-col gap-1 text-2xs text-muted">
          Sector
          <select data-testid="explorer-sector" value={sector} onChange={(e) => { setSector(e.target.value); setPage(0); }} className="border border-line bg-ink px-2 py-1 text-sm text-fg">
            <option value="all">All sectors</option>
            {sectors.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-2xs text-muted">
          Source
          <select value={source} onChange={(e) => setUrl("source", e.target.value, "all")} className="border border-line bg-ink px-2 py-1 text-sm text-fg" data-testid="explorer-source">
            <option value="all">All (composite)</option>
            {["reddit", "hackernews", "wikipedia", "search", "github"].map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-2xs text-muted">
          Change window
          <select value={String(window)} onChange={(e) => setUrl("window", e.target.value, "30")} className="border border-line bg-ink px-2 py-1 text-sm text-fg">
            {["7", "30", "90"].map((w) => <option key={w} value={w}>{w} days</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-2xs text-muted">
          Min. confidence: <span className="num text-fg">{minConf}</span>
          <input type="range" min={0} max={90} step={5} value={minConf} onChange={(e) => { setMinConf(Number(e.target.value)); setPage(0); }} aria-valuetext={`${minConf}`} data-testid="explorer-confidence" />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-2xs text-muted">Preset</legend>
          <div className="flex flex-wrap">
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <button key={p} type="button" aria-pressed={preset === p} onClick={() => { setPreset(p); setSort(defaultSort(p)); setPage(0); }}
                className={`-ml-px border border-line px-2 py-1 text-xs first:ml-0 ${preset === p ? "bg-cyan/20 text-fg" : "text-muted hover:text-fg"}`}>
                {PRESETS[p].label}
              </button>
            ))}
          </div>
        </fieldset>
        <details className="relative">
          <summary className="cursor-pointer border border-line px-2 py-1 text-xs text-muted">More filters</summary>
          <div className="absolute z-20 mt-1 grid w-72 grid-cols-2 gap-2 border border-line bg-raised p-3 text-2xs text-muted">
            <label className="flex flex-col gap-1">Score ≥<input className={input} inputMode="numeric" value={range.scoreMin} onChange={(e) => setRange({ ...range, scoreMin: e.target.value })} /></label>
            <label className="flex flex-col gap-1">Score ≤<input className={input} inputMode="numeric" value={range.scoreMax} onChange={(e) => setRange({ ...range, scoreMax: e.target.value })} /></label>
            <label className="flex flex-col gap-1">Attention ≥<input className={input} inputMode="numeric" value={range.attnMin} onChange={(e) => setRange({ ...range, attnMin: e.target.value })} /></label>
            <label className="flex flex-col gap-1">Hype risk
              <select className="border border-line bg-ink px-1 py-1 text-sm" value={hype} onChange={(e) => setHype(e.target.value as "any" | "elevated+")}>
                <option value="any">Any</option><option value="elevated+">Elevated or high</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">Sentiment ≥<input className={input} inputMode="numeric" value={range.sentMin} onChange={(e) => setRange({ ...range, sentMin: e.target.value })} /></label>
            <label className="flex flex-col gap-1">Sentiment ≤<input className={input} inputMode="numeric" value={range.sentMax} onChange={(e) => setRange({ ...range, sentMax: e.target.value })} /></label>
          </div>
        </details>
        <details className="relative">
          <summary className="cursor-pointer border border-line px-2 py-1 text-xs text-muted">Columns</summary>
          <fieldset className="absolute z-20 mt-1 w-56 border border-line bg-raised p-2 text-xs">
            <legend className="sr-only">Visible columns</legend>
            {COLUMNS.filter((c) => c.key !== "ticker").map((c) => (
              <label key={c.key} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} />
                {c.label}
              </label>
            ))}
          </fieldset>
        </details>
        <button type="button" onClick={exportCsv} disabled={!filtered.length} className="ml-auto border border-cyan/60 px-3 py-1 text-sm text-cyan hover:bg-cyan/10 disabled:opacity-40" data-testid="export-csv">
          Export CSV ({filtered.length})
        </button>
      </div>

      <p className="text-xs text-muted" role="status" aria-live="polite" data-testid="explorer-count">
        {filtered.length} of {rows.length} companies{preset !== "none" ? `, preset: ${PRESETS[preset].label.toLowerCase()}` : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-line p-8 text-center">
          <p className="text-sm">No companies match these filters.</p>
          <button type="button" className="mt-2 text-xs text-cyan underline" onClick={() => { setQ(""); setSector("all"); setMinConf(0); setPreset("none"); setHype("any"); setRange({ scoreMin: "", scoreMax: "", attnMin: "", sentMin: "", sentMax: "" }); }}>
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="grid-table" data-testid="explorer-table">
            <caption className="sr-only">Stock explorer, sortable. Missing values are shown as a dash and sort last.</caption>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} scope="col" className={c.numeric ? "r" : ""} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    {sortBtn(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.ticker}>
                  {cols.map((c) => <td key={c.key} className={c.numeric ? "r" : ""}>{cell(r, c.key, source)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-2 text-sm">
          <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="border border-line px-2 py-1 disabled:opacity-40">Previous</button>
          <span className="num text-muted">Page {cur + 1} of {pages}</span>
          <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="border border-line px-2 py-1 disabled:opacity-40">Next</button>
        </nav>
      ) : null}
    </div>
  );
}

function defaultSort(p: Preset): { key: ColKey; dir: 1 | -1 } {
  if (p === "bearish") return { key: "score", dir: 1 };
  if (p === "unusual") return { key: "attention", dir: -1 };
  if (p === "divergent") return { key: "divergence", dir: -1 };
  if (p === "bullish") return { key: "score", dir: -1 };
  return { key: "rank", dir: 1 };
}

function cell(r: StockRow, k: ColKey, source: string) {
  switch (k) {
    case "ticker":
      return <Link href={`/company/${r.ticker}`} className="font-semibold hover:text-cyan">{r.ticker}</Link>;
    case "name":
      return <span className="block max-w-[220px] truncate" title={r.name}>{r.name}</span>;
    case "sector":
      return <span className="text-muted">{r.sector}</span>;
    case "marketCapUsd":
      return <span className="num text-muted">{fmtCap(r.marketCapUsd)}</span>;
    case "score":
      return source === "all" ? <ScoreCell value={r.score} /> : <span className="text-2xs text-faint" title="The composite needs all sources">n/a</span>;
    case "attention":
      return <span className="num">{fmtNum(r.attention)}</span>;
    case "sentiment":
      return <Signed value={r.sentiment} />;
    case "attentionAcceleration":
      return <Signed value={r.attentionAcceleration} digits={2} />;
    case "scoreChange":
      return <Signed value={r.scoreChange} />;
    case "hypeRisk":
      return <HypeTag level={r.hypeRisk} />;
    case "sources":
      return <span className="num text-muted" title={r.sourcesAvailable.join(", ")}>{r.sourcesAvailable.length}/{r.sourcesExpected.length}</span>;
    case "confidence":
      return <span className={`num ${r.confidence < 40 ? "text-amber" : ""}`}>{r.confidence}</span>;
    default: {
      const v = r[k as keyof StockRow];
      return <span className="num">{v === null || v === undefined ? "—" : String(v)}</span>;
    }
  }
}
