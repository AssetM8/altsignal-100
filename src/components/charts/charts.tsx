"use client";
import { useRouter } from "next/navigation";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

const AX = { stroke: "#24365a", tickLine: false } as const;
const shortDate = (d: string) => (typeof d === "string" ? d.slice(5) : String(d));

export function MoodChart({ data }: { data: { date: string; mood: number | null; p25: number | null; p75: number | null }[] }) {
  const rows = data.map((d) => ({ ...d, band: d.p25 !== null && d.p75 !== null ? [d.p25, d.p75] : null }));
  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...AX} minTickGap={24} />
        <YAxis domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} {...AX} width={40} />
        <ReferenceLine y={0} stroke="#6b7a93" strokeDasharray="3 3" />
        <Tooltip formatter={(v: unknown, n) => [Array.isArray(v) ? `${v[0]} to ${v[1]}` : String(v), n === "band" ? "Middle 50% of companies" : "Market mood"]} labelFormatter={(l) => `${l} (UTC)`} />
        <Legend verticalAlign="top" height={24} iconType="square" formatter={(v) => (v === "band" ? "Middle 50% of companies" : "Market mood (confidence-weighted)")} />
        <Area dataKey="band" stroke="none" fill="#48bfe0" fillOpacity={0.15} isAnimationActive={false} />
        <Line dataKey="mood" stroke="#48bfe0" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ScoreHistogram({ bins }: { bins: { from: number; to: number; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={bins.map((b) => ({ ...b, label: `${b.from}–${b.to}` }))} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="from" {...AX} ticks={[0, 25, 50, 75]} tickFormatter={(v) => String(v)} />
        <YAxis allowDecimals={false} {...AX} width={30} />
        <ReferenceLine x={50} stroke="#6b7a93" strokeDasharray="3 3" />
        <Tooltip formatter={(v) => [String(v), "Companies"]} labelFormatter={(l) => `Score ${l}–${Number(l) + 5}`} />
        <Bar dataKey="count" isAnimationActive={false}>
          {bins.map((b) => (
            <Cell key={b.from} fill={b.from >= 55 ? "#45c08f" : b.from < 45 ? "#ef7066" : "#94a2b8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const HYPE_COLOR = { low: "#94a2b8", elevated: "#e8ad45", high: "#ef7066" } as const;

export function AttentionSentimentScatter({ points }: { points: { ticker: string; attention: number; sentiment: number; confidence: number; hypeRisk: "low" | "elevated" | "high" }[] }) {
  const router = useRouter();
  const groups = (["low", "elevated", "high"] as const).map((h) => ({ h, data: points.filter((p) => p.hypeRisk === h) }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
        <CartesianGrid />
        <XAxis type="number" dataKey="attention" domain={[0, 100]} name="Attention" {...AX} label={{ value: "Attention score (0–100)", position: "insideBottom", offset: -10, fill: "#94a2b8", fontSize: 11 }} />
        <YAxis type="number" dataKey="sentiment" domain={[-100, 100]} name="Sentiment" {...AX} width={40} />
        <ZAxis type="number" dataKey="confidence" range={[20, 140]} name="Confidence" />
        <ReferenceLine x={50} stroke="#6b7a93" strokeDasharray="3 3" />
        <ReferenceLine y={0} stroke="#6b7a93" strokeDasharray="3 3" />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
            if (!p) return null;
            return (
              <div className="border border-line bg-raised px-2 py-1 text-xs">
                <p className="font-semibold">{p.ticker}</p>
                <p>Attention {p.attention.toFixed(1)}, sentiment {p.sentiment.toFixed(1)}</p>
                <p className="text-muted">Confidence {p.confidence}, hype risk {p.hypeRisk}</p>
              </div>
            );
          }}
        />
        <Legend verticalAlign="top" height={24} formatter={(v) => `Hype risk: ${v}`} />
        {groups.map((g) => (
          <Scatter
            key={g.h}
            name={g.h}
            data={g.data}
            fill={HYPE_COLOR[g.h]}
            fillOpacity={0.8}
            shape={g.h === "low" ? "circle" : g.h === "elevated" ? "triangle" : "diamond"}
            isAnimationActive={false}
            onClick={(d: unknown) => {
              const t = (d as { ticker?: string; payload?: { ticker?: string } })?.payload?.ticker ?? (d as { ticker?: string })?.ticker;
              if (t) router.push(`/company/${t}`);
            }}
            cursor="pointer"
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export function SeriesChart({ data, series, domain, height = 200, unit, zeroLine, step }: { data: Record<string, unknown>[]; series: SeriesDef[]; domain?: [number | "auto", number | "auto"]; height?: number; unit?: string; zeroLine?: number; step?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 12, bottom: 2, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...AX} minTickGap={28} />
        <YAxis domain={domain ?? ["auto", "auto"]} {...AX} width={46} tickFormatter={(v: number) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}k` : String(Math.round(v * 100) / 100))} />
        {zeroLine !== undefined ? <ReferenceLine y={zeroLine} stroke="#6b7a93" strokeDasharray="3 3" /> : null}
        <Tooltip labelFormatter={(l) => `${l} (UTC)`} formatter={(v, n) => [v === null || v === undefined ? "missing" : `${typeof v === "number" ? Math.round(v * 100) / 100 : String(v)}${unit ?? ""}`, String(n)]} />
        <Legend verticalAlign="top" height={22} iconType="plainline" />
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dashed ? "4 3" : undefined} dot={false} type={step ? "stepAfter" : "linear"} connectNulls={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ScoreReturnScatter({ points }: { points: { date: string; score: number; ret: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
        <CartesianGrid />
        <XAxis type="number" dataKey="score" domain={[0, 100]} {...AX} label={{ value: "Alt Signal Score on signal date", position: "insideBottom", offset: -10, fill: "#94a2b8", fontSize: 11 }} />
        <YAxis type="number" dataKey="ret" unit="%" {...AX} width={44} />
        <ReferenceLine y={0} stroke="#6b7a93" strokeDasharray="3 3" />
        <ReferenceLine x={50} stroke="#6b7a93" strokeDasharray="3 3" />
        <Tooltip formatter={(v, n) => [n === "ret" ? `${v}%` : String(v), n === "ret" ? "Next 5-day return" : "Score"]} labelFormatter={() => ""} />
        <Scatter data={points} fill="#a592f0" fillOpacity={0.7} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function IcBars({ data }: { data: { date: string; rankIc: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 2, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...AX} minTickGap={28} />
        <YAxis {...AX} width={44} domain={[-0.5, 0.5]} />
        <ReferenceLine y={0} stroke="#6b7a93" />
        <Tooltip formatter={(v) => [typeof v === "number" ? v.toFixed(3) : "—", "Rank IC"]} labelFormatter={(l) => `Signal date ${l}`} />
        <Bar dataKey="rankIc" isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.date} fill={(d.rankIc ?? 0) >= 0 ? "#45c08f" : "#ef7066"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpreadCurve({ data }: { data: { date: string; cumulative: number; drawdown: number }[] }) {
  const rows = data.map((d) => ({ date: d.date, cumulative: Math.round(d.cumulative * 10_000) / 100, drawdown: Math.round(d.drawdown * 10_000) / 100 }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={rows} margin={{ top: 6, right: 12, bottom: 2, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...AX} minTickGap={28} />
        <YAxis unit="%" {...AX} width={50} />
        <ReferenceLine y={0} stroke="#6b7a93" />
        <Tooltip formatter={(v, n) => [`${v}%`, n === "cumulative" ? "Cumulative top − bottom spread" : "Drawdown"]} labelFormatter={(l) => `Rebalance ${l}`} />
        <Legend verticalAlign="top" height={22} formatter={(v) => (v === "cumulative" ? "Cumulative spread (gross, %)" : "Drawdown (%)")} />
        <Area dataKey="drawdown" stroke="#ef7066" fill="#ef7066" fillOpacity={0.2} isAnimationActive={false} />
        <Line dataKey="cumulative" stroke="#48bfe0" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function QuintileBars({ data }: { data: { quintile: number; mean: number | null; median: number | null }[] }) {
  const rows = data.map((d) => ({ q: `Q${d.quintile}`, mean: d.mean === null ? null : Math.round(d.mean * 100_00) / 100, median: d.median === null ? null : Math.round(d.median * 100_00) / 100 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 2, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="q" {...AX} />
        <YAxis unit="%" {...AX} width={50} />
        <ReferenceLine y={0} stroke="#6b7a93" />
        <Tooltip formatter={(v, n) => [`${v}%`, n === "mean" ? "Mean forward return" : "Median forward return"]} />
        <Legend verticalAlign="top" height={22} formatter={(v) => (v === "mean" ? "Mean" : "Median")} />
        <Bar dataKey="mean" fill="#48bfe0" isAnimationActive={false} />
        <Bar dataKey="median" fill="#a592f0" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
