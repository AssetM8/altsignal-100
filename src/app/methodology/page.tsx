import type { Metadata } from "next";
import { BASELINE, COMPONENT_KEYS, COMPONENT_LABELS, CONFIDENCE, DEFAULT_WEIGHTS, PENALTIES, SENTIMENT, SOURCE_ATTENTION_WEIGHTS, SOURCE_SENTIMENT_WEIGHTS, ANOMALY, DOCUMENT_RETENTION_DAYS } from "@/config/signal";
import { SOURCE_DESCRIPTORS } from "@/lib/providers/descriptors";
import { DEMO_EVENTS } from "@/lib/providers/fixtures/events";
import { Panel, StateBadge } from "@/components/ui";
import { getDataset } from "@/lib/services/dataset";

export const metadata: Metadata = { title: "Sources & methodology" };
export const dynamic = "force-dynamic";

const UNUSUAL = [
  {
    name: "Wikipedia attention shock",
    why: "Encyclopaedia look-ups capture broad, non-trader curiosity (news, executive changes, product launches). It is collected independently of social platforms.",
    fails: "Article renames, bots that evade the user-agent filter, events that are newsworthy but irrelevant to the business.",
    momentum: "Computed from page views only; no price input. It can follow price moves (people look up a stock that jumped), which the Lab measures rather than assumes away.",
  },
  {
    name: "Product − investment sentiment divergence",
    why: "Customers and developers often notice product problems before investors discuss them, and vice versa.",
    fails: "Thin aspect samples; product complaints that are routine (outage jokes); aspect misclassification by a lexicon model.",
    momentum: "Built from text aspects; it compares two kinds of talk rather than tracking price.",
  },
  {
    name: "Developer-activity acceleration",
    why: "Open-source activity in a company's GitHub organisations is a slow-moving proxy for ecosystem engagement, especially for platform companies.",
    fails: "Only ~45% coverage; reflects OSS strategy, not total R&D; release bursts create spikes.",
    momentum: "Counts public events; unrelated to trading activity.",
  },
  {
    name: "Retail-attention crowding",
    why: "Reddit attention rising far faster than every other source suggests a retail-specific narrative rather than broad news.",
    fails: "Genuine retail-first news; Reddit outages; small samples.",
    momentum: "Uses the gap between sources' attention z-scores, not returns.",
  },
  {
    name: "Community breadth",
    why: "Discussion spread across many independent communities is harder to manufacture than a burst in one forum.",
    fails: "Cross-posting inflates breadth (we de-duplicate cross-posts first).",
    momentum: "A dispersion measure of where text appears.",
  },
];

export default async function MethodologyPage() {
  const ds = await getDataset();
  const stateBy = new Map(ds.sources.map((s) => [s.id, s]));
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div>
        <h1 className="text-xl font-bold">Sources & methodology</h1>
        <p className="max-w-3xl text-sm text-muted">
          Every score on this site is computed from alternative data. Market capitalisation defines the universe and prices appear only as context and as outcome labels in the Signal Lab.
          The full specification is in METHODOLOGY.md and DATA_SOURCES.md in the repository.
        </p>
      </div>

      <Panel title="Data sources">
        <div className="overflow-x-auto">
          <table className="grid-table">
            <thead><tr><th>Source</th><th>Status</th><th>What it measures</th><th>Access and licence</th><th>Known biases</th></tr></thead>
            <tbody>
              {Object.values(SOURCE_DESCRIPTORS).map((d) => (
                <tr key={d.id} className="align-top">
                  <td className="font-semibold">{d.name}</td>
                  <td><StateBadge state={stateBy.get(d.id)?.state ?? "unavailable"} /></td>
                  <td className="whitespace-normal text-xs">{d.description}</td>
                  <td className="whitespace-normal text-xs text-muted">{d.license} {d.rateLimit.notes}</td>
                  <td className="whitespace-normal text-xs text-muted">{d.knownBiases.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Text pipeline">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Clean: strip HTML, decode entities, remove control and zero-width characters, cap length.</li>
          <li>Language: stop-word and script check; non-English items are dropped.</li>
          <li>De-duplicate: canonical URLs (reposts, cross-posts), normalised exact text, and 64-bit SimHash near-duplicates (Hamming ≤ 3). Accounts that repeat near-identical text three or more times are flagged as bot-like.</li>
          <li>Resolve companies with whole-token matching of cashtags, tickers, names, products, subsidiaries, misspellings and previous tickers. Word-like tickers (T, NOW, CAT…) and ambiguous names (Apple, Visa, Meta…) need nearby market or company context; exclusion phrases (“apple pie”, “student visa”) veto a match; all-caps shouting is ignored. Each mention records why it matched.</li>
          <li>Classify each mention with a finance-aware lexicon model: polarity with negation and intensifiers, sarcasm and uncertainty flags, and an aspect (investment, product, reputation, general). Only investment-aspect items get a bullish or bearish direction.</li>
          <li>Aggregate per company and UTC day: mentions, unique authors, engagement-weighted mentions, confidence-weighted sentiment (aspect weights: investment 1.0, reputation 0.75, general 0.6, product 0.5), duplicate, bot and ambiguity ratios, community concentration.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">Raw items are kept for {DOCUMENT_RETENTION_DAYS} days as an audit trail (previews only, authors as salted hashes); aggregates are kept for the full history.</p>
      </Panel>

      <Panel title="Per-source features (point in time)">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>Attention level: log(1 + engagement-weighted mentions) for text, log(1 + value) for numeric sources.</li>
          <li>Abnormal attention z: today’s {BASELINE.shortWindow}-day mean minus the median of the previous {BASELINE.baselineWindow} days of {BASELINE.shortWindow}-day means, divided by max(MAD, SD, {BASELINE.scaleFloor}). Requires ≥ {BASELINE.minShortObs} observations in the window and ≥ {BASELINE.minBaselineObs} baseline points; clipped to ±{BASELINE.zClip}.</li>
          <li>Acceleration: mean of the last 3 days minus the mean of the 7 days before, scaled by daily dispersion.</li>
          <li>Sentiment: Bayesian-shrunk weighted mean, Σ(w·s) / (Σw + {SENTIMENT.shrinkageK}); reported only with ≥ {SENTIMENT.minMentions} mentions in 7 days. Aspect sentiments use a prior of {SENTIMENT.aspectShrinkageK}.</li>
          <li>Missing days stay missing. A text source that was collected but had no mentions has an explicit zero; a day that was not collected has no row.</li>
        </ul>
      </Panel>

      <Panel title="Cross-source metrics">
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          <div><dt className="font-semibold">Attention Score (0–100)</dt><dd className="text-muted">100 × Φ(weighted mean of available sources’ z). Weights: {Object.entries(SOURCE_ATTENTION_WEIGHTS).map(([k, v]) => `${k} ${pct(v)}`).join(", ")}.</dd></div>
          <div><dt className="font-semibold">Sentiment Score (−100 to +100)</dt><dd className="text-muted">100 × tanh(2.5 × weighted text sentiment). Weights: {Object.entries(SOURCE_SENTIMENT_WEIGHTS).map(([k, v]) => `${k} ${pct(v ?? 0)}`).join(", ")}.</dd></div>
          <div><dt className="font-semibold">Attention Acceleration, Sentiment Change</dt><dd className="text-muted">Blended per-source values standardised across the universe on the same day (σ).</dd></div>
          <div><dt className="font-semibold">Agreement (0–100)</dt><dd className="text-muted">60% from the spread of sources’ attention z (SD / 2), 40% from the gap between Reddit and Hacker News sentiment (gap / 0.5). Needs two sources.</dd></div>
          <div><dt className="font-semibold">Divergence (0–100)</dt><dd className="text-muted">The larger of (range of z − 1.5) / 4.5 and (sentiment gap − 0.15) / 0.6.</dd></div>
          <div><dt className="font-semibold">Data Confidence (0–100)</dt><dd className="text-muted">100 × coverage^{CONFIDENCE.exponents.coverage} × sample^{CONFIDENCE.exponents.sample} × freshness^{CONFIDENCE.exponents.freshness} × quality^{CONFIDENCE.exponents.quality}; sample = 1 − exp(−(text mentions + 8 × numeric sources) / {CONFIDENCE.sampleScale}); freshness decays after {CONFIDENCE.staleAfterDays} days.</dd></div>
          <div><dt className="font-semibold">Anomaly Score (0–100)</dt><dd className="text-muted">100 × (1 − Bonferroni p) for the largest |z| among sources and sentiment change. Events are logged at |z| ≥ {ANOMALY.eventZ}, with a {ANOMALY.refractoryDays}-day refractory period.</dd></div>
          <div><dt className="font-semibold">Hype risk</dt><dd className="text-muted">High when Reddit z ≥ 3 and exceeds the other sources by ≥ 2σ, or Reddit z ≥ 2 with bot share above {pct(PENALTIES.bots.threshold)}. Elevated at z ≥ 2 and gap ≥ 1.25σ.</dd></div>
        </dl>
      </Panel>

      <Panel title="Alternative Signal Score" note="Weights live in src/config/signal.ts and can be changed per run in the Signal Lab.">
        <p className="text-sm">Score = 50 + 50 × clip(Σ wᵢcᵢ × √(confidence / 100) × (1 − penalties), −1, 1). Components cᵢ are in [−1, 1]; missing components count as 0 and their weight is not redistributed.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="grid-table">
            <thead><tr><th>Component</th><th className="r">Weight</th><th>Definition</th></tr></thead>
            <tbody>
              {COMPONENT_KEYS.map((k) => (
                <tr key={k}>
                  <td>{COMPONENT_LABELS[k]}</td>
                  <td className="r num">{pct(DEFAULT_WEIGHTS[k])}</td>
                  <td className="whitespace-normal text-xs text-muted">
                    {{
                      abnormalAttention: "tanh(max(0, attention z) / 2) × tone, where tone = tanh(4 × sentiment). Quiet periods are not treated as bearish.",
                      sentiment: "tanh(2.5 × blended sentiment).",
                      attentionAcceleration: "tanh(max(0, standardised acceleration) / 2) × tone.",
                      sentimentAcceleration: "tanh(standardised sentiment change / 2).",
                      confirmation: "Share of sources with z > 0.5 (if at least two) × tone.",
                      unusualSource: "tanh(max(0, mean z of Wikipedia, search and GitHub) / 2) × tone.",
                    }[k]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">
          Changed from the 30/25/20/10/10/5 starting point: abnormal attention 30% → 25% and sentiment 25% → 30%. Attention has no direction of its own, so it is multiplied by tone; at 30% it let loud but neutral names dominate the ranking.
        </p>
        <p className="mt-2 text-sm text-muted">
          Penalties: tiny sample (&lt; {PENALTIES.tinySample.threshold} text mentions) {pct(PENALTIES.tinySample.amount)}; duplicates &gt; {pct(PENALTIES.duplicates.threshold)} {pct(PENALTIES.duplicates.amount)}; single-source dominance {pct(PENALTIES.singleSource.amount)}; stale inputs {pct(PENALTIES.stale.amount)}; ambiguity &gt; {pct(PENALTIES.ambiguity.threshold)} {pct(PENALTIES.ambiguity.amount)}; bot share &gt; {pct(PENALTIES.bots.threshold)} {pct(PENALTIES.bots.amount)}; one source at z ≥ {PENALTIES.hype.zSingle} with the rest below {PENALTIES.hype.zOthers} {pct(PENALTIES.hype.amount)}. Total capped at {pct(PENALTIES.maxTotal)}.
        </p>
      </Panel>

      <Panel title="Differentiated signals">
        <div className="space-y-3">
          {UNUSUAL.map((u) => (
            <div key={u.name} className="border-l-2 border-violet pl-3">
              <h3 className="text-sm font-semibold">{u.name}</h3>
              <p className="text-sm"><span className="text-muted">Why it might carry information: </span>{u.why}</p>
              <p className="text-sm"><span className="text-muted">Failure modes: </span>{u.fails}</p>
              <p className="text-sm"><span className="text-muted">Not a momentum repackage because: </span>{u.momentum}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Research integrity">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>All alt-data days are UTC calendar days. A signal dated d uses items published before 24:00 UTC on d, after the US close.</li>
          <li>Forward-return labels start at the next trading-day close after the signal date and run h trading days; labels past the last price are not created. The Lab verifies this mechanically on every run.</li>
          <li>Baselines only use data before the current window; cross-sectional standardisation uses the same day only.</li>
          <li>Inference (t-statistics, confidence intervals, spread curves) uses non-overlapping rebalance dates; the test period is the last 20% of dates and is never used to choose weights.</li>
          <li>Survivorship: the universe is a single dated snapshot applied to all history. Delisted or demoted companies are absent.</li>
          <li>Multiple testing, turnover and transaction costs are disclosed with every Lab result. Associations are not described as predictive unless the held-out test supports it.</li>
        </ul>
      </Panel>

      {ds.meta.isSynthetic ? (
        <Panel title="Planted demo events" note="These scenarios exist only in the synthetic fixtures, so you can see how the pipeline reacts. They are not real observations.">
          <table className="grid-table">
            <thead><tr><th>Ticker</th><th>Starts</th><th>Scenario</th><th>Purpose</th></tr></thead>
            <tbody>
              {DEMO_EVENTS.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="font-semibold">{e.ticker}</td>
                  <td className="num">{e.startOffset} days before as-of, {e.durationDays} days</td>
                  <td className="whitespace-normal">{e.title}</td>
                  <td className="whitespace-normal text-xs text-muted">{e.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}
    </div>
  );
}
