import Link from "next/link";
import { Suspense } from "react";
import { getOverview, parseViewQuery, type StockRow } from "@/lib/services/views";
import { FilterBar } from "@/components/filters";
import { MoodGauge } from "@/components/gauge";
import { AttentionSentimentScatter, MoodChart, ScoreHistogram } from "@/components/charts/lazy";
import { EmptyState, HypeTag, Panel, ScoreCell, Signed, StateBadge } from "@/components/ui";
import { ANOMALY_LABEL, SOURCE_LABEL, divergingTint, fmtCap, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

function MiniTable({ rows, metric, label, empty, digits = 1, signed }: { rows: StockRow[]; metric: keyof StockRow; label: string; empty: string; digits?: number; signed?: boolean }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <th scope="col">Ticker</th>
          <th scope="col" className="r">{label}</th>
          <th scope="col" className="r">Conf.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.ticker}>
            <td>
              <Link href={`/company/${r.ticker}`} className="font-semibold hover:text-cyan">
                {r.ticker}
              </Link>
              <span className="ml-2 hidden text-xs text-faint xl:inline">{r.name.replace(/,? (Inc\.|Corporation|Incorporated|Company)$/, "").slice(0, 18)}</span>
            </td>
            <td className="r">{metric === "score" ? <ScoreCell value={r.score} /> : signed ? <Signed value={r[metric] as number} digits={digits} /> : <span className="num">{fmtNum(r[metric] as number, digits)}</span>}</td>
            <td className="r num text-muted">{r.confidence}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: SP }) {
  const q = parseViewQuery(await searchParams);
  const o = await getOverview(q);
  const single = q.source !== "all";
  const k = o.kpis;
  const textSource = q.source === "all" || q.source === "reddit" || q.source === "hackernews";

  const kpis: { label: string; value: React.ReactNode; hint: string }[] = [
    { label: "Market mood", value: <Signed value={k.mood} />, hint: "Confidence-weighted mean sentiment, −100 to +100" },
    { label: "Mood change", value: <Signed value={k.moodChange} />, hint: `Over the last ${q.window} days` },
    { label: "Positive breadth", value: <span className="num">{k.breadth === null ? "—" : `${k.breadth}%`}</span>, hint: "Share of companies with positive sentiment" },
    { label: "Abnormal attention", value: <span className="num">{k.abnormalAttention}</span>, hint: "Companies with attention score ≥ 90" },
    { label: "Anomalies", value: <span className="num">{k.anomalies}</span>, hint: `Events flagged in ${q.window} days` },
    { label: "Data confidence", value: <span className="num">{k.avgConfidence ?? "—"}</span>, hint: `Average, ${k.sourcesActive}/${k.sourcesTotal} sources active` },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Market overview</h1>
          <p className="text-sm text-muted">
            Attention and sentiment from alternative data across {k.universe} companies. Prices are not inputs to any score.
          </p>
        </div>
        <Suspense>
          <FilterBar sectors={o.allSectors} />
        </Suspense>
      </div>

      {single ? (
        <p className="border-l-2 border-violet bg-panel px-3 py-2 text-xs text-muted" role="note">
          Showing {SOURCE_LABEL[q.source]} only. The Alternative Signal Score is a cross-source composite, so it is hidden in single-source view;
          attention and sentiment come from this source alone{textSource ? "" : " (this source has no sentiment)"}.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 border-l border-t border-line bg-panel sm:grid-cols-3 xl:grid-cols-6" aria-label="Key figures">
        {kpis.map((x) => (
          <div key={x.label} className="border-b border-r border-line px-3 py-2.5">
            <dt className="text-xs text-muted">{x.label}</dt>
            <dd className="mt-0.5 text-2xl font-bold">{x.value}</dd>
            <dd className="text-2xs text-faint">{x.hint}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="Alternative-data mood" note="Text sources only (Reddit, Hacker News). Shrunk toward 0 when samples are thin.">
          <MoodGauge value={k.mood} change={k.moodChange} />
          <ul className="mt-3 space-y-1 text-xs">
            {o.sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span className="text-muted">{s.name}</span>
                <span className="flex items-center gap-2">
                  <span className="num text-faint">{s.coverage} cos.</span>
                  <StateBadge state={s.state} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={`Market mood, last ${q.window} days`} note="Daily, UTC. Band shows the 25th–75th percentile of company sentiment scores. Source: Reddit and Hacker News text, aggregated.">
          {o.moodSeries.some((d) => d.mood !== null) ? <MoodChart data={o.moodSeries} /> : <EmptyState title="No sentiment for this selection">Pick a text source or widen the filters.</EmptyState>}
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">View as table</summary>
            <table className="grid-table mt-2">
              <thead><tr><th>Date (UTC)</th><th className="r">Mood</th><th className="r">P25</th><th className="r">P75</th><th className="r">Companies</th></tr></thead>
              <tbody>{o.moodSeries.map((d) => <tr key={d.date}><td>{d.date}</td><td className="r">{fmtNum(d.mood)}</td><td className="r">{fmtNum(d.p25)}</td><td className="r">{fmtNum(d.p75)}</td><td className="r">{d.n}</td></tr>)}</tbody>
            </table>
          </details>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="Sector sentiment heatmap" note="Mean company sentiment score per sector (−100 to +100); attention is the mean attention score (50 = normal). Cells tinted green/red by sign; values always shown.">
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th scope="col">Sector</th>
                  <th scope="col" className="r">Cos.</th>
                  <th scope="col" className="r">Composite</th>
                  <th scope="col" className="r">Reddit</th>
                  <th scope="col" className="r">Hacker News</th>
                  <th scope="col" className="r">7d change</th>
                  <th scope="col" className="r">Attention</th>
                </tr>
              </thead>
              <tbody>
                {o.heatmap.map((h) => (
                  <tr key={h.sector}>
                    <th scope="row" className="!bg-transparent !text-fg !font-normal">{h.sector}</th>
                    <td className="r num text-muted">{h.companies}</td>
                    {[h.composite, h.reddit, h.hackernews].map((v, i) => (
                      <td key={i} className="r num" style={{ background: divergingTint(v === null ? null : v / 40) }}>
                        {fmtNum(v)}
                      </td>
                    ))}
                    <td className="r"><Signed value={h.change7d} /></td>
                    <td className="r num" style={{ background: divergingTint(h.attention === null ? null : (h.attention - 50) / 40) }}>{fmtNum(h.attention)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Attention vs sentiment" note="One point per company, sized by data confidence. Click a point to open the company. Shape and colour both encode hype risk.">
          {o.scatter.length ? <AttentionSentimentScatter points={o.scatter} /> : <EmptyState title="Nothing to plot">This source has no sentiment, or no company passes the filters.</EmptyState>}
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <Panel title={single ? "Most positive sentiment" : "Highest signal score"} note={single ? "Source sentiment, −100 to +100" : "Alt Signal Score, 0–100 (50 = neutral)"}>
          <MiniTable rows={o.bullish} metric={single ? "sentiment" : "score"} label={single ? "Sentiment" : "Score"} empty="No scored companies" signed={single} />
        </Panel>
        <Panel title={single ? "Most negative sentiment" : "Lowest signal score"} note={single ? "Source sentiment, −100 to +100" : "Alt Signal Score, 0–100 (50 = neutral)"}>
          <MiniTable rows={o.bearish} metric={single ? "sentiment" : "score"} label={single ? "Sentiment" : "Score"} empty="No scored companies" signed={single} />
        </Panel>
        <Panel title="Fastest-rising attention" note="Attention acceleration, standardised across the universe (σ)">
          <MiniTable rows={o.rising} metric="attentionAcceleration" label="Accel. σ" empty="No acceleration data" digits={2} signed />
        </Panel>
        <Panel title="Largest source disagreement" note="Source divergence, 0–100">
          <MiniTable rows={o.disagreements} metric="divergence" label="Divergence" empty="Needs two or more sources" digits={0} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Signal score distribution" note={`Alt Signal Score in bins of 5 points; ${o.histogram.reduce((a, b) => a + b.count, 0)} companies scored. Most sit near 50 because thin or conflicting data shrinks scores toward neutral.`}>
          {single ? <EmptyState title="Composite not defined for one source">Switch the source filter to “All sources” to see the score distribution.</EmptyState> : <ScoreHistogram bins={o.histogram} />}
        </Panel>
        <Panel title="Recent anomalies" note="Thresholds: |z| ≥ 3.5 against the company's own 30-day baseline, divergence ≥ 85, or hype criteria. A repeat within 7 days is suppressed." actions={<Link href="/explorer?preset=unusual" className="text-xs text-cyan hover:underline">Unusual companies</Link>}>
          {o.anomalies.length ? (
            <ol className="divide-y divide-line-soft" aria-label="Anomaly feed, newest first">
              {o.anomalies.map((a, i) => (
                <li key={`${a.ticker}-${a.date}-${a.kind}-${i}`} className="flex items-baseline gap-3 py-1.5 text-sm">
                  <time className="num w-20 shrink-0 text-xs text-faint" dateTime={a.date}>{a.date}</time>
                  <Link href={`/company/${a.ticker}`} className="w-14 shrink-0 font-semibold hover:text-cyan">{a.ticker}</Link>
                  <span className="min-w-0 flex-1">
                    <span className="text-fg">{ANOMALY_LABEL[a.kind] ?? a.kind}</span>
                    <span className="text-muted">: {a.description}</span>
                  </span>
                  <span className="hidden text-xs text-faint sm:inline">{SOURCE_LABEL[a.sourceId] ?? a.sourceId}</span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title={`No anomalies in the last ${q.window} days`}>Try the 90-day window.</EmptyState>
          )}
        </Panel>
      </div>

      <Panel
        title="Ranked by Alternative Signal Score"
        actions={<Link href="/explorer" className="text-xs text-cyan hover:underline">Open all 100 in the explorer</Link>}
        note="Score change is measured over the selected window. Hype risk flags retail-attention crowding without confirmation from other sources."
      >
        <div className="overflow-x-auto">
          <table className="grid-table">
            <thead>
              <tr>
                <th scope="col">Ticker</th>
                <th scope="col">Company</th>
                <th scope="col">Sector</th>
                <th scope="col" className="r">Mkt cap</th>
                <th scope="col" className="r">Score</th>
                <th scope="col" className="r">Change</th>
                <th scope="col" className="r">Attention</th>
                <th scope="col" className="r">Sentiment</th>
                <th scope="col" className="r">Agreement</th>
                <th scope="col" className="r">Confidence</th>
                <th scope="col">Hype risk</th>
              </tr>
            </thead>
            <tbody>
              {o.ranked.map((r) => (
                <tr key={r.ticker}>
                  <td><Link className="font-semibold hover:text-cyan" href={`/company/${r.ticker}`}>{r.ticker}</Link></td>
                  <td className="max-w-[220px] truncate">{r.name}</td>
                  <td className="text-muted">{r.sector}</td>
                  <td className="r num text-muted">{fmtCap(r.marketCapUsd)}</td>
                  <td className="r"><ScoreCell value={r.score} /></td>
                  <td className="r"><Signed value={r.scoreChange} /></td>
                  <td className="r num">{fmtNum(r.attention)}</td>
                  <td className="r"><Signed value={r.sentiment} /></td>
                  <td className="r num">{r.agreement ?? "—"}</td>
                  <td className="r num">{r.confidence}</td>
                  <td><HypeTag level={r.hypeRisk} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
