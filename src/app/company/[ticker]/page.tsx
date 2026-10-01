import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPONENT_KEYS, COMPONENT_LABELS, DEFAULT_WEIGHTS, type SourceId } from "@/config/signal";
import { ENTITY_OVERRIDES, AMBIGUOUS_TICKERS } from "@/data/entities";
import { getStockDetail } from "@/lib/services/views";
import { normalizeWeights } from "@/lib/signals/composite";
import { SeriesChart, ScoreReturnScatter } from "@/components/charts/lazy";
import { EmptyState, HypeTag, Panel, Signed, StateBadge, Tag } from "@/components/ui";
import { ANOMALY_LABEL, SOURCE_COLOR, SOURCE_LABEL, divergingTint, fmtCap, fmtDateTime, fmtNum } from "@/lib/format";
import { shortNameFromOfficial } from "@/lib/providers/universe";

export const dynamic = "force-dynamic";

type Params = Promise<{ ticker: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { ticker } = await params;
  return { title: decodeURIComponent(ticker).toUpperCase() };
}

const PENALTY_LABEL: Record<string, string> = {
  tinySample: "Tiny sample",
  duplicates: "Duplicate content",
  singleSource: "Single-source dominance",
  stale: "Stale data",
  ambiguity: "Ticker ambiguity",
  bots: "Suspected bot activity",
  hype: "Unconfirmed hype",
};

export default async function CompanyPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { ticker: raw } = await params;
  const sp = await searchParams;
  const ticker = decodeURIComponent(raw);
  if (!/^[A-Za-z.\-]{1,10}$/.test(ticker)) notFound();
  const win = [30, 90, 180].includes(Number(sp.window)) ? Number(sp.window) : 90;
  const d = await getStockDetail(ticker, win);
  if (!d) notFound();
  const { company: c, latest: s } = d;
  const w = normalizeWeights(DEFAULT_WEIGHTS);
  const penaltyTotal = Math.min(0.8, (s?.penalties ?? []).reduce((a, p) => a + p.amount, 0));
  const ov = ENTITY_OVERRIDES[c.ticker] ?? {};
  const unavailable = d.sources.filter((x) => x.state === "unavailable" || (x.expected && !x.available));

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      {/* Identity */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
        <div>
          <p className="text-xs text-muted">
            <Link href="/explorer" className="hover:text-cyan">Stock explorer</Link> / {c.sector}
          </p>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 text-2xl font-bold">
            <span>{c.ticker}</span>
            <span className="text-lg font-normal text-muted">{c.name}</span>
          </h1>
          <p className="mt-1 text-xs text-muted">
            {c.exchange}, {c.industry}. Universe rank #{c.rank} by market cap ({fmtCap(c.marketCapUsd)}) in the {d.meta.universeAsOf} snapshot
            {d.meta.universeIsLive ? "" : " (bundled sample, approximate)"}.
            {c.previousTickers.length ? ` Previously traded as ${c.previousTickers.join(", ")}.` : ""}
          </p>
        </div>
        <div className="flex items-end gap-6">
          <div className="text-right">
            <p className="text-xs text-muted">Alt Signal Score</p>
            <p className="num text-4xl font-bold" data-testid="company-score">{fmtNum(s?.altSignalScore ?? null)}</p>
            <p className="text-2xs text-faint">0–100, 50 = neutral, as of {d.meta.asOf}</p>
          </div>
          <nav aria-label="Chart window" className="flex">
            {[30, 90, 180].map((x) => (
              <Link key={x} href={`?window=${x}`} scroll={false} aria-current={x === win ? "true" : undefined} className={`-ml-px border border-line px-2.5 py-1 text-sm first:ml-0 ${x === win ? "bg-cyan/20" : "text-muted hover:text-fg"}`}>
                {x}d
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {unavailable.length ? (
        <p className="border-l-2 border-amber bg-panel px-3 py-2 text-xs text-muted" role="note">
          Not used today: {unavailable.map((u) => `${u.name} (${u.state === "unavailable" ? u.stateReason ?? "unavailable" : u.freshnessDays !== null && u.freshnessDays > 2 ? `stale, ${u.freshnessDays} days old` : "too few recent observations"})`).join("; ")}.
        </p>
      ) : null}

      {/* Score ledger: why the stock got its score */}
      <Panel title="Why this score" note="Contribution = weight × component. Components are in [−1, +1]; attention components are signed by the prevailing tone because attention alone has no direction. The adjusted score shrinks the raw composite toward 50 by √(confidence) and by penalties.">
        {s ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="grid-table" aria-label="Score components">
                <thead>
                  <tr>
                    <th scope="col">Component</th>
                    {COMPONENT_KEYS.map((k) => <th key={k} scope="col" className="r" title={COMPONENT_LABELS[k]}>{COMPONENT_LABELS[k].replace(" (tone-signed)", "")}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="!font-normal">Value (−1 to +1)</th>
                    {COMPONENT_KEYS.map((k) => <td key={k} className="r num" style={{ background: divergingTint(s.components[k]) }}>{s.components[k] === null ? "missing" : fmtNum(s.components[k], 2)}</td>)}
                  </tr>
                  <tr>
                    <th scope="row" className="!font-normal">Weight</th>
                    {COMPONENT_KEYS.map((k) => <td key={k} className="r num text-muted">{Math.round(w[k] * 100)}%</td>)}
                  </tr>
                  <tr>
                    <th scope="row" className="!font-normal">Contribution</th>
                    {COMPONENT_KEYS.map((k) => <td key={k} className="r"><Signed value={s.contributions[k] === null ? null : (s.contributions[k] as number) * 50} digits={1} /></td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <table className="grid-table">
                <caption className="pb-1 text-left text-xs text-muted">Data confidence {s.confidence}/100 = 100 × coverage^0.35 × sample^0.30 × freshness^0.15 × quality^0.20</caption>
                <tbody>
                  {Object.entries(s.confidenceFactors).map(([k, v]) => (
                    <tr key={k}><th scope="row" className="!font-normal capitalize">{k}</th><td className="r num">{fmtNum(v, 2)}</td></tr>
                  ))}
                </tbody>
              </table>
              <table className="grid-table">
                <caption className="pb-1 text-left text-xs text-muted">Penalties (total {Math.round(penaltyTotal * 100)}%, capped at 80%)</caption>
                <tbody>
                  {s.penalties.length ? s.penalties.map((p) => (
                    <tr key={p.key}><th scope="row" className="!font-normal">{PENALTY_LABEL[p.key]}</th><td className="text-muted">{p.detail}</td><td className="r num text-neg">−{Math.round(p.amount * 100)}%</td></tr>
                  )) : <tr><td className="text-muted">No penalties applied.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-stretch border border-line" aria-label="Score roll-up">
              <div className="flex-1 bg-violet/25 px-3 py-2 text-sm">Raw composite <span className="num font-bold">{fmtNum(s.rawScore)}</span></div>
              <div className="flex-1 bg-raised px-3 py-2 text-sm">× √confidence ({fmtNum(Math.sqrt(s.confidence / 100), 2)}) × (1 − penalties {Math.round(penaltyTotal * 100)}%)</div>
              <div className="flex-1 bg-cyan/25 px-3 py-2 text-sm font-semibold">Alt Signal Score <span className="num text-lg">{fmtNum(s.altSignalScore)}</span></div>
            </div>
          </div>
        ) : (
          <EmptyState title="No signal for the as-of date">This company has no usable alternative data on {d.meta.asOf}.</EmptyState>
        )}
      </Panel>

      {/* Headline metrics */}
      {s ? (
        <dl className="grid grid-cols-2 border-l border-t border-line bg-panel sm:grid-cols-4 xl:grid-cols-8">
          {[
            ["Attention", <span key="a" className="num">{fmtNum(s.attentionScore)}</span>, "0–100"],
            ["Sentiment", <Signed key="s" value={s.sentimentScore} />, "−100 to +100"],
            ["Attn. acceleration", <Signed key="aa" value={s.attentionAcceleration} digits={2} />, "σ vs universe"],
            ["Sentiment change", <Signed key="sc" value={s.sentimentChange} digits={2} />, "σ vs universe"],
            ["Agreement", <span key="ag" className="num">{s.agreement ?? "—"}</span>, "0–100"],
            ["Divergence", <span key="dv" className="num">{s.divergence ?? "—"}</span>, "0–100"],
            ["Anomaly score", <span key="an" className="num">{fmtNum(s.anomalyScore)}</span>, "Bonferroni-adjusted"],
            ["Hype risk", <HypeTag key="h" level={s.hypeRisk} />, `Crowding ${fmtNum(s.unusual.retailCrowding, 2)}`],
          ].map(([l, v, h]) => (
            <div key={l as string} className="border-b border-r border-line px-3 py-2">
              <dt className="text-xs text-muted">{l}</dt>
              <dd className="mt-0.5 text-xl font-bold">{v}</dd>
              <dd className="text-2xs text-faint">{h}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* Signal stack — stacked panels on a shared time axis */}
      <Panel title={`Signal stack, last ${win} days`} note="Daily, UTC. Gaps are days with missing data (never filled with zeros). Attention is the abnormal-attention z-score of the 7-day mean against the prior 30 days of 7-day means.">
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex flex-wrap gap-4"><Tag color="#48bfe0">Alt Signal Score</Tag><Tag color="#a592f0">Data confidence</Tag></div>
            <SeriesChart data={d.history} series={[{ key: "score", label: "Alt Signal Score", color: "#48bfe0" }, { key: "confidence", label: "Confidence", color: "#a592f0", dashed: true }]} domain={[0, 100]} zeroLine={50} height={180} />
          </div>
          <div>
            <div className="mb-1 flex flex-wrap gap-4">{(["reddit", "hackernews", "wikipedia", "search", "github"] as SourceId[]).map((src) => <Tag key={src} color={SOURCE_COLOR[src] as string}>{SOURCE_LABEL[src]} attention z</Tag>)}</div>
            <SeriesChart data={d.history} series={(["reddit", "hackernews", "wikipedia", "search", "github"] as SourceId[]).map((src) => ({ key: `z_${src}`, label: SOURCE_LABEL[src] as string, color: SOURCE_COLOR[src] as string }))} domain={[-4, 4]} zeroLine={0} height={180} unit="σ" />
          </div>
          <div>
            <div className="mb-1 flex flex-wrap gap-4"><Tag color={SOURCE_COLOR.reddit as string}>Reddit sentiment</Tag><Tag color={SOURCE_COLOR.hackernews as string}>Hacker News sentiment</Tag><Tag color="#e7ebf2">Composite sentiment</Tag></div>
            <SeriesChart data={d.history} series={[{ key: "s_reddit", label: "Reddit", color: SOURCE_COLOR.reddit as string }, { key: "s_hackernews", label: "Hacker News", color: SOURCE_COLOR.hackernews as string }, { key: "sentiment", label: "Composite", color: "#e7ebf2", dashed: true }]} domain={[-100, 100]} zeroLine={0} height={180} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-1 flex flex-wrap gap-4"><Tag color={SOURCE_COLOR.reddit as string}>Reddit mentions/day</Tag><Tag color={SOURCE_COLOR.hackernews as string}>HN mentions/day</Tag><Tag color="#a592f0">Reddit engagement-adjusted</Tag></div>
              <SeriesChart data={d.activity} series={[{ key: "reddit_value", label: "Reddit mentions", color: SOURCE_COLOR.reddit as string }, { key: "hackernews_value", label: "HN mentions", color: SOURCE_COLOR.hackernews as string }, { key: "reddit_engagement", label: "Reddit engagement-adj.", color: "#a592f0", dashed: true }]} height={170} />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap gap-4"><Tag color={SOURCE_COLOR.wikipedia as string}>Wikipedia views/day</Tag></div>
              <SeriesChart data={d.activity} series={[{ key: "wikipedia_value", label: "Page views", color: SOURCE_COLOR.wikipedia as string }]} height={170} />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap gap-4"><Tag color={SOURCE_COLOR.search as string}>Search interest index (0–100)</Tag></div>
              {d.activity.some((a) => a.search_value !== undefined) ? <SeriesChart data={d.activity} series={[{ key: "search_value", label: "Search index", color: SOURCE_COLOR.search as string }]} height={150} /> : <EmptyState title="No search-interest data for this company" />}
            </div>
            <div>
              <div className="mb-1 flex flex-wrap gap-4"><Tag color={SOURCE_COLOR.github as string}>GitHub public events/day</Tag></div>
              {d.activity.some((a) => a.github_value !== undefined) ? <SeriesChart data={d.activity} series={[{ key: "github_value", label: "Events", color: SOURCE_COLOR.github as string }]} height={150} step /> : <EmptyState title="No mapped GitHub organisation">Developer activity is only tracked for companies with a public open-source footprint.</EmptyState>}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Source comparison" note="z = abnormal attention vs the company's own history. Sentiment −100 to +100 (text sources only). A source counts toward agreement only when it has enough recent observations.">
          <div className="overflow-x-auto">
            <table className="grid-table" data-testid="source-table">
              <thead>
                <tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Used today</th><th scope="col" className="r">Attention z</th><th scope="col" className="r">Accel.</th><th scope="col" className="r">Sentiment</th><th scope="col" className="r">Mentions 7d</th><th scope="col" className="r">Data age</th></tr>
              </thead>
              <tbody>
                {d.sources.map((x) => (
                  <tr key={x.id}>
                    <td><Tag color={SOURCE_COLOR[x.id] as string}>{x.name}</Tag></td>
                    <td><StateBadge state={x.state} /></td>
                    <td className="text-xs">{x.available ? "Yes" : x.expected ? <span className="text-amber">No, insufficient recent data</span> : <span className="text-faint">Not covered</span>}</td>
                    <td className="r" style={{ background: divergingTint(x.available && x.z !== null ? x.z / 4 : null, 0.4) }}><Signed value={x.available ? x.z : null} digits={2} /></td>
                    <td className="r"><Signed value={x.available ? x.accel : null} digits={2} /></td>
                    <td className="r"><Signed value={x.sentiment} /></td>
                    <td className="r num">{x.mentions7 ?? "—"}</td>
                    <td className="r num">{x.freshnessDays === null ? "—" : `${x.freshnessDays}d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s ? (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-muted">Agreement</p><p className="num text-lg font-semibold">{s.agreement ?? "—"}</p></div>
              <div><p className="text-xs text-muted">Divergence</p><p className="num text-lg font-semibold">{s.divergence ?? "—"}</p></div>
              <div><p className="text-xs text-muted">Product − investment tone</p><Signed value={s.unusual.productDivergence} digits={2} className="text-lg font-semibold" /></div>
              <div><p className="text-xs text-muted">Community breadth</p><p className="num text-lg font-semibold">{fmtNum(s.unusual.communityBreadth)}</p></div>
            </div>
          ) : null}
        </Panel>

        <Panel title="Dominant narratives, last 30 days" note="Aspect is detected from the words around each mention. Product praise is not counted as a bullish investment view. Only items within the 45-day retention window are stored.">
          <table className="grid-table">
            <thead><tr><th scope="col">Aspect</th><th scope="col" className="r">Items</th><th scope="col" className="r">Pos.</th><th scope="col" className="r">Neg.</th><th scope="col" className="r">Neutral</th><th scope="col">Frequent terms</th></tr></thead>
            <tbody>
              {d.narratives.map((n) => (
                <tr key={n.aspect}>
                  <th scope="row" className="!font-normal capitalize">{n.aspect}</th>
                  <td className="r num">{n.items}</td>
                  <td className="r num" style={{ background: divergingTint(n.items ? n.positive / n.items : null, 0.6) }}>{n.positive}</td>
                  <td className="r num" style={{ background: divergingTint(n.items ? -n.negative / n.items : null, 0.6) }}>{n.negative}</td>
                  <td className="r num">{n.neutral + n.sarcastic}</td>
                  <td className="max-w-[220px] truncate text-xs text-muted">{n.topTerms.map((x) => x.term).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Representative items, last 14 days" note={d.meta.isSynthetic ? "These are SYNTHETIC demo items. Their links use a reserved .invalid domain and are not clickable." : "Previews only; follow the link for the original public item. Author handles are never stored."}>
          {d.items.length ? (
            <ul className="divide-y divide-line-soft">
              {d.items.slice(0, 12).map((it) => (
                <li key={it.id} className="py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-2xs text-faint">
                    <Tag color={SOURCE_COLOR[it.source] as string}>{SOURCE_LABEL[it.source]}</Tag>
                    <span>{it.community}</span>
                    <time dateTime={it.publishedAt}>{fmtDateTime(it.publishedAt)}</time>
                    <span className="num">{it.engagement} points, {it.comments} comments</span>
                  </div>
                  <p className="mt-1 text-sm">
                    {it.url && !it.isSynthetic ? <a href={it.url} rel="noopener noreferrer nofollow" target="_blank" className="hover:text-cyan">{it.title || it.body}</a> : it.title || it.body}
                  </p>
                  {it.title && it.body ? <p className="text-xs text-muted">{it.body}</p> : null}
                  <p className="mt-1 text-2xs text-muted">
                    Matched “{it.matched}” by <span className="text-fg">{it.matchReason}</span> (relevance {fmtNum(it.relevance, 2)})
                    {it.sentiment ? <>, classified <span className="text-fg">{it.sentiment.label}</span> {it.sentiment.aspect} sentiment ({fmtNum(it.sentiment.score, 2)}, confidence {fmtNum(it.sentiment.confidence, 2)}){it.sentiment.terms ? `; terms: ${it.sentiment.terms}` : ""}</> : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No stored items in the last 14 days">Either nothing mentioned this company or the text sources are unavailable.</EmptyState>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Anomaly timeline" note="Most recent first. Thresholds are described in the methodology.">
            {d.anomalies.length ? (
              <ol className="relative ml-2 border-l border-line">
                {d.anomalies.slice(0, 12).map((a, i) => (
                  <li key={`${a.date}-${a.kind}-${i}`} className="ml-3 py-1.5">
                    <span aria-hidden="true" className="absolute -left-[5px] mt-1.5 h-2 w-2 bg-cyan" />
                    <p className="text-xs"><time className="num text-faint" dateTime={a.date}>{a.date}</time> <span className="font-semibold">{ANOMALY_LABEL[a.kind] ?? a.kind}</span></p>
                    <p className="text-xs text-muted">{a.description}</p>
                  </li>
                ))}
              </ol>
            ) : <EmptyState title="No anomalies recorded" />}
          </Panel>
          <Panel title="Score vs next 5-day return" note={d.meta.pricesSynthetic ? "Synthetic demo prices, used only as outcome labels. Each dot is one signal date; overlapping 5-day windows are not independent. Not evidence of predictability." : "Retrospective only. Overlapping windows; not evidence of predictability."}>
            {d.scoreVsReturn.length ? <ScoreReturnScatter points={d.scoreVsReturn} /> : <EmptyState title="No outcome labels">A market-data provider is needed for retrospective validation.</EmptyState>}
          </Panel>
        </div>
      </div>

      <Panel title={`How ${c.ticker} is measured`} note="Entity rules come from src/data/entities.ts; the full method is in Sources & methodology.">
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <dl className="space-y-1.5">
            <div><dt className="inline text-muted">Names matched: </dt><dd className="inline">{[c.name, ...(ov.shortNames ?? [shortNameFromOfficial(c.name)])].join(", ")}</dd></div>
            <div><dt className="inline text-muted">Cashtag and ticker: </dt><dd className="inline">${c.ticker}{AMBIGUOUS_TICKERS.has(c.ticker) || c.ticker.length <= 2 ? ` (bare “${c.ticker}” is an ordinary word or too short, so it only counts with nearby market context)` : `, bare ${c.ticker}`}</dd></div>
            {ov.products?.length ? <div><dt className="inline text-muted">Products: </dt><dd className="inline">{ov.products.join(", ")}</dd></div> : null}
            {ov.subsidiaries?.length ? <div><dt className="inline text-muted">Subsidiaries: </dt><dd className="inline">{ov.subsidiaries.join(", ")}</dd></div> : null}
            {ov.ambiguousAliases?.length ? <div><dt className="inline text-muted">Needs context: </dt><dd className="inline">{ov.ambiguousAliases.join(", ")}</dd></div> : null}
            {ov.exclusions?.length ? <div><dt className="inline text-muted">Excluded phrases: </dt><dd className="inline">{ov.exclusions.join(", ")}</dd></div> : null}
          </dl>
          <dl className="space-y-1.5">
            <div><dt className="inline text-muted">Wikipedia article: </dt><dd className="inline">{ov.wikipediaTitle ? decodeURIComponent(ov.wikipediaTitle).replaceAll("_", " ") : "none mapped"}</dd></div>
            <div><dt className="inline text-muted">GitHub organisations: </dt><dd className="inline">{ov.githubOrgs?.join(", ") || "none (developer activity not used)"}</dd></div>
            <div><dt className="inline text-muted">Search term: </dt><dd className="inline">{ov.searchTerm ?? shortNameFromOfficial(c.name)}</dd></div>
            <div><dt className="inline text-muted">Sources expected: </dt><dd className="inline">{s?.sourcesExpected.map((x) => SOURCE_LABEL[x]).join(", ") || "none"}</dd></div>
            <div><dt className="inline text-muted">Models: </dt><dd className="inline">{d.meta.compositeModel}, {d.meta.classifierModel}</dd></div>
          </dl>
        </div>
      </Panel>
    </div>
  );
}
