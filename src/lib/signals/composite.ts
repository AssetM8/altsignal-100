import {
  ANOMALY,
  CONFIDENCE,
  COMPONENT_KEYS,
  DEFAULT_WEIGHTS,
  PENALTIES,
  SOURCE_ATTENTION_WEIGHTS,
  SOURCE_IDS,
  SOURCE_SENTIMENT_WEIGHTS,
  TEXT_SOURCES,
  UNUSUAL_SOURCES,
  type ComponentKey,
  type SourceId,
} from "@/config/signal";
import { clip, isNum, mean, normCdf, std, zscoreCross } from "../util/stats";
import type { SourceFeatures } from "./features";

/**
 * Cross-source composite. Inputs are ONLY the per-source alternative-data
 * features from features.ts — this module has no access to prices, returns
 * or fundamentals (enforced by a test that inspects its imports).
 */

export type HypeRisk = "low" | "elevated" | "high";

export interface PenaltyHit {
  key: "tinySample" | "duplicates" | "singleSource" | "stale" | "ambiguity" | "bots" | "hype";
  amount: number;
  detail: string;
}

export interface CompanySignal {
  ticker: string;
  date: string;
  altSignalScore: number | null;
  rawScore: number | null;
  attentionScore: number | null;
  sentimentScore: number | null;
  /** Cross-sectionally standardised. */
  attentionAcceleration: number | null;
  /** Cross-sectionally standardised. */
  sentimentChange: number | null;
  agreement: number | null;
  divergence: number | null;
  confidence: number;
  anomalyScore: number | null;
  hypeRisk: HypeRisk;
  components: Record<ComponentKey, number | null>;
  contributions: Record<ComponentKey, number | null>;
  penalties: PenaltyHit[];
  confidenceFactors: { coverage: number; sample: number; freshness: number; quality: number };
  sourcesAvailable: SourceId[];
  sourcesExpected: SourceId[];
  /** Differentiated "unusual" signals, kept separate for research. */
  unusual: {
    wikiShock: number | null;
    productDivergence: number | null;
    devAcceleration: number | null;
    communityBreadth: number | null;
    retailCrowding: number | null;
    searchAcceleration: number | null;
  };
  blended: { attentionZ: number | null; sentiment: number | null; accelRaw: number | null; sentimentChangeRaw: number | null; textMentions7: number };
  perSource: Partial<Record<SourceId, { z: number | null; accel: number | null; sentiment: number | null; mentions7: number | null; freshnessDays: number | null; available: boolean }>>;
}

export interface CompositeOptions {
  weights?: Partial<Record<ComponentKey, number>>;
  excludeSources?: readonly SourceId[];
  /** Sources that have ever produced data for each ticker (for coverage). */
  expectedSources: Map<string, SourceId[]>;
}

function weightedMean(pairs: Array<[number | null | undefined, number]>): number | null {
  let num = 0;
  let den = 0;
  for (const [v, w] of pairs) {
    if (isNum(v) && w > 0) {
      num += v * w;
      den += w;
    }
  }
  return den ? num / den : null;
}

export function normalizeWeights(w: Partial<Record<ComponentKey, number>> | undefined): Record<ComponentKey, number> {
  const merged = { ...DEFAULT_WEIGHTS, ...(w ?? {}) };
  const total = COMPONENT_KEYS.reduce((a, k) => a + Math.max(0, merged[k]), 0);
  const out = {} as Record<ComponentKey, number>;
  for (const k of COMPONENT_KEYS) out[k] = total > 0 ? Math.max(0, merged[k]) / total : 0;
  return out;
}

/** Compute all company signals for one date (needs the full cross-section for standardisation). */
export function computeSignalsForDate(
  date: string,
  featuresByTicker: Map<string, Partial<Record<SourceId, SourceFeatures>>>,
  opts: CompositeOptions,
): CompanySignal[] {
  const weights = normalizeWeights(opts.weights);
  const excluded = new Set(opts.excludeSources ?? []);
  const tickers = Array.from(featuresByTicker.keys());

  // Pass 1 — per-company blends.
  const pre = tickers.map((ticker) => {
    const feats = featuresByTicker.get(ticker) ?? {};
    const avail = SOURCE_IDS.filter((s) => !excluded.has(s) && feats[s]?.available);
    const z = (s: SourceId) => (avail.includes(s) ? (feats[s]?.abnormalZ ?? null) : null);
    const attentionZ = weightedMean(avail.map((s) => [z(s), SOURCE_ATTENTION_WEIGHTS[s]]));
    const accelRaw = weightedMean(avail.map((s) => [feats[s]?.accelZ, SOURCE_ATTENTION_WEIGHTS[s]]));
    const textAvail = TEXT_SOURCES.filter((s) => !excluded.has(s) && feats[s] && (feats[s]?.freshnessDays ?? 99) <= 7);
    const sentiment = weightedMean(textAvail.map((s) => [feats[s]?.sentiment7, SOURCE_SENTIMENT_WEIGHTS[s] ?? 0]));
    const sentimentChangeRaw = weightedMean(textAvail.map((s) => [feats[s]?.sentimentChange, SOURCE_SENTIMENT_WEIGHTS[s] ?? 0]));
    return { ticker, feats, avail, attentionZ, accelRaw, sentiment, sentimentChangeRaw, textAvail };
  });

  // Pass 2 — cross-sectional standardisation (same date only: no look-ahead).
  const accelCs = zscoreCross(pre.map((p) => p.accelRaw));
  const sentChgCs = zscoreCross(pre.map((p) => p.sentimentChangeRaw));

  return pre.map((p, i) => {
    const { ticker, feats, avail, attentionZ, sentiment, textAvail } = p;
    const accel = accelCs[i] ?? null;
    const sentChg = sentChgCs[i] ?? null;
    const expected = (opts.expectedSources.get(ticker) ?? []).filter((s) => !excluded.has(s));
    const textMentions7 = textAvail.reduce((a, s) => a + (feats[s]?.mentions7 ?? 0), 0);

    // Agreement / divergence across sources.
    const zs = avail.map((s) => feats[s]?.abnormalZ).filter(isNum);
    const sents = textAvail.map((s) => feats[s]?.sentiment7).filter(isNum);
    let agreement: number | null = null;
    let divergence: number | null = null;
    if (zs.length >= 2) {
      const dA = std(zs, 0) ?? 0;
      const attnAgree = 1 - clip(dA / 2, 0, 1);
      const dS = sents.length >= 2 ? Math.abs((sents[0] as number) - (sents[1] as number)) : null;
      const sentAgree = dS === null ? null : 1 - clip(dS / 0.5, 0, 1);
      agreement = Math.round(100 * (sentAgree === null ? attnAgree : 0.6 * attnAgree + 0.4 * sentAgree));
      const rangeZ = Math.max(...zs) - Math.min(...zs);
      divergence = Math.round(100 * Math.max(clip((rangeZ - 1.5) / 4.5, 0, 1), dS === null ? 0 : clip((dS - 0.15) / 0.6, 0, 1)));
    }

    // Data confidence.
    const coverage = expected.length ? avail.length / expected.length : 0;
    const numericAvail = avail.filter((s) => !TEXT_SOURCES.includes(s)).length;
    const sample = 1 - Math.exp(-(textMentions7 + 8 * numericAvail) / CONFIDENCE.sampleScale);
    const freshDays = avail.map((s) => feats[s]?.freshnessDays ?? 7);
    const worstFresh = freshDays.length ? Math.max(...freshDays) : 7;
    const freshness = Math.exp(-Math.max(0, worstFresh - CONFIDENCE.staleAfterDays) / 3);
    const dup = mean(textAvail.map((s) => feats[s]?.dupRatio7)) ?? 0;
    const bots = mean(textAvail.map((s) => feats[s]?.botRatio7)) ?? 0;
    const amb = mean(textAvail.map((s) => feats[s]?.ambiguity7)) ?? 0;
    const quality = 1 - clip(0.5 * dup + bots + 0.5 * amb, 0, 0.9);
    const e = CONFIDENCE.exponents;
    const confidence = avail.length
      ? Math.round(100 * coverage ** e.coverage * sample ** e.sample * freshness ** e.freshness * quality ** e.quality)
      : 0;

    // Components in [-1, 1]. Attention is undirected, so it is signed by tone.
    const toneSign = sentiment === null ? 0 : Math.tanh(4 * sentiment);
    const unusualZs = UNUSUAL_SOURCES.filter((s) => avail.includes(s)).map((s) => feats[s]?.abnormalZ).filter(isNum);
    const nUp = zs.filter((z) => z > 0.5).length;
    const components: Record<ComponentKey, number | null> = {
      abnormalAttention: attentionZ === null ? null : Math.tanh(Math.max(0, attentionZ) / 2) * toneSign,
      sentiment: sentiment === null ? null : Math.tanh(2.5 * sentiment),
      attentionAcceleration: accel === null ? null : Math.tanh(Math.max(0, accel) / 2) * toneSign,
      sentimentAcceleration: sentChg === null ? null : Math.tanh(sentChg / 2),
      confirmation: zs.length >= 2 ? (nUp >= 2 ? (nUp / zs.length) * toneSign : 0) : null,
      unusualSource: unusualZs.length ? Math.tanh(Math.max(0, mean(unusualZs) as number) / 2) * toneSign : null,
    };
    // Missing components contribute 0 (neutral) and their weight is not redistributed;
    // the confidence term already reflects the missing data.
    const contributions = {} as Record<ComponentKey, number | null>;
    let raw = 0;
    let anyComponent = false;
    for (const k of COMPONENT_KEYS) {
      const c = components[k];
      contributions[k] = c === null ? null : weights[k] * c;
      if (c !== null) {
        raw += weights[k] * c;
        anyComponent = true;
      }
    }

    // Penalties shrink toward neutral.
    const penalties: PenaltyHit[] = [];
    if (textMentions7 < PENALTIES.tinySample.threshold) penalties.push({ key: "tinySample", amount: PENALTIES.tinySample.amount, detail: `${textMentions7} text mentions in 7d (< ${PENALTIES.tinySample.threshold})` });
    if (dup > PENALTIES.duplicates.threshold) penalties.push({ key: "duplicates", amount: PENALTIES.duplicates.amount, detail: `duplicate share ${(dup * 100).toFixed(0)}%` });
    const attnShares = avail.map((s) => SOURCE_ATTENTION_WEIGHTS[s]);
    const shareMax = attnShares.length ? Math.max(...attnShares) / attnShares.reduce((a, b) => a + b, 0) : 1;
    if (avail.length <= 1 || shareMax > PENALTIES.singleSource.dominanceShare) penalties.push({ key: "singleSource", amount: PENALTIES.singleSource.amount, detail: `${avail.length} source(s) available` });
    if (freshness < 0.6) penalties.push({ key: "stale", amount: PENALTIES.stale.amount, detail: `oldest input ${worstFresh} days old` });
    if (amb > PENALTIES.ambiguity.threshold) penalties.push({ key: "ambiguity", amount: PENALTIES.ambiguity.amount, detail: `${(amb * 100).toFixed(0)}% of mentions needed context to resolve` });
    if (bots > PENALTIES.bots.threshold) penalties.push({ key: "bots", amount: PENALTIES.bots.amount, detail: `bot-like repeat share ${(bots * 100).toFixed(0)}%` });
    const hypeSource = avail.find((s) => (feats[s]?.abnormalZ ?? 0) >= PENALTIES.hype.zSingle && avail.filter((o) => o !== s).every((o) => (feats[o]?.abnormalZ ?? 0) < PENALTIES.hype.zOthers));
    if (hypeSource) penalties.push({ key: "hype", amount: PENALTIES.hype.amount, detail: `${hypeSource} z ≥ ${PENALTIES.hype.zSingle} without confirmation` });
    const penaltyTotal = Math.min(PENALTIES.maxTotal, penalties.reduce((a, p) => a + p.amount, 0));

    const adjusted = raw * Math.sqrt(confidence / 100) * (1 - penaltyTotal);
    const altSignalScore = anyComponent ? round1(50 + 50 * clip(adjusted, -1, 1)) : null;

    // Anomaly score: Bonferroni-adjusted two-sided tail probability of the largest |z|.
    const tests = [...zs, ...(sentChg !== null ? [sentChg] : [])];
    let anomalyScore: number | null = null;
    if (tests.length) {
      const maxAbs = Math.max(...tests.map(Math.abs));
      const p = Math.min(1, tests.length * 2 * (1 - normCdf(maxAbs)));
      anomalyScore = round1(100 * (1 - p));
    }

    // Retail crowding / hype risk.
    const redditZ = avail.includes("reddit") ? (feats.reddit?.abnormalZ ?? null) : null;
    const othersZ = mean(avail.filter((s) => s !== "reddit").map((s) => feats[s]?.abnormalZ));
    const crowding = redditZ === null ? null : redditZ - (othersZ ?? 0);
    let hypeRisk: HypeRisk = "low";
    if (redditZ !== null && crowding !== null) {
      if ((redditZ >= 3 && crowding >= 2) || (redditZ >= 2 && bots > PENALTIES.bots.threshold)) hypeRisk = "high";
      else if (redditZ >= 2 && crowding >= 1.25) hypeRisk = "elevated";
    }

    const pooledProduct = weightedMean(textAvail.map((s) => [feats[s]?.product7, SOURCE_SENTIMENT_WEIGHTS[s] ?? 0]));
    const pooledInvestment = weightedMean(textAvail.map((s) => [feats[s]?.investment7, SOURCE_SENTIMENT_WEIGHTS[s] ?? 0]));

    const perSource: CompanySignal["perSource"] = {};
    for (const s of SOURCE_IDS) {
      const f = feats[s];
      if (!f) continue;
      perSource[s] = {
        z: f.abnormalZ,
        accel: f.accelZ,
        sentiment: f.sentiment7,
        mentions7: f.mentions7,
        freshnessDays: f.freshnessDays,
        available: avail.includes(s),
      };
    }

    return {
      ticker,
      date,
      altSignalScore,
      rawScore: anyComponent ? round1(50 + 50 * clip(raw, -1, 1)) : null,
      attentionScore: attentionZ === null ? null : round1(100 * normCdf(attentionZ)),
      sentimentScore: sentiment === null ? null : round1(100 * Math.tanh(2.5 * sentiment)),
      attentionAcceleration: accel === null ? null : round2(accel),
      sentimentChange: sentChg === null ? null : round2(sentChg),
      agreement,
      divergence,
      confidence,
      anomalyScore,
      hypeRisk,
      components,
      contributions,
      penalties,
      confidenceFactors: { coverage: round2(coverage), sample: round2(sample), freshness: round2(freshness), quality: round2(quality) },
      sourcesAvailable: avail,
      sourcesExpected: expected,
      unusual: {
        wikiShock: avail.includes("wikipedia") ? (feats.wikipedia?.abnormalZ ?? null) : null,
        productDivergence: pooledProduct !== null && pooledInvestment !== null && textMentions7 >= 15 ? round2(pooledProduct - pooledInvestment) : null,
        devAcceleration: avail.includes("github") ? (feats.github?.accelZ ?? null) : null,
        communityBreadth: feats.reddit?.breadth7 ?? null,
        retailCrowding: crowding === null ? null : round2(crowding),
        searchAcceleration: avail.includes("search") ? (feats.search?.accelZ ?? null) : null,
      },
      blended: { attentionZ, sentiment, accelRaw: p.accelRaw, sentimentChangeRaw: p.sentimentChangeRaw, textMentions7 },
      perSource,
    };
  });
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

export interface AnomalyEvent {
  ticker: string;
  date: string;
  sourceId: SourceId | "cross";
  kind: "attention_spike" | "attention_drop" | "sentiment_shift" | "hype" | "divergence" | "product_divergence";
  z: number;
  description: string;
}

/** Turn a day's signals into discrete anomaly events (first day a threshold is crossed). */
export function detectAnomalies(today: CompanySignal, yesterday: CompanySignal | undefined): AnomalyEvent[] {
  const ev: AnomalyEvent[] = [];
  for (const [src, ps] of Object.entries(today.perSource) as [SourceId, NonNullable<CompanySignal["perSource"][SourceId]>][]) {
    if (!ps.available || ps.z === null) continue;
    const prev = yesterday?.perSource[src]?.z ?? 0;
    if (ps.z >= ANOMALY.eventZ && prev < ANOMALY.eventZ) ev.push({ ticker: today.ticker, date: today.date, sourceId: src, kind: "attention_spike", z: ps.z, description: `${src} attention ${ps.z.toFixed(1)}σ above its 30-day baseline` });
    if (ps.z <= -ANOMALY.eventZ && prev > -ANOMALY.eventZ) ev.push({ ticker: today.ticker, date: today.date, sourceId: src, kind: "attention_drop", z: ps.z, description: `${src} attention ${Math.abs(ps.z).toFixed(1)}σ below baseline` });
  }
  const sc = today.sentimentChange;
  if (sc !== null && Math.abs(sc) >= ANOMALY.eventZ && Math.abs(yesterday?.sentimentChange ?? 0) < ANOMALY.eventZ) {
    ev.push({ ticker: today.ticker, date: today.date, sourceId: "cross", kind: "sentiment_shift", z: sc, description: `Week-over-week sentiment change ${sc > 0 ? "+" : ""}${sc.toFixed(1)}σ vs universe` });
  }
  if (today.hypeRisk === "high" && yesterday?.hypeRisk !== "high") {
    ev.push({ ticker: today.ticker, date: today.date, sourceId: "reddit", kind: "hype", z: today.unusual.retailCrowding ?? 0, description: "Retail-attention crowding without cross-source confirmation" });
  }
  if ((today.divergence ?? 0) >= 85 && (yesterday?.divergence ?? 0) < 85) {
    ev.push({ ticker: today.ticker, date: today.date, sourceId: "cross", kind: "divergence", z: (today.divergence ?? 0) / 25, description: `Sources disagree strongly (divergence ${today.divergence})` });
  }
  const pd = today.unusual.productDivergence;
  if (pd !== null && pd <= -0.6 && (yesterday?.unusual.productDivergence ?? 0) > -0.6) {
    ev.push({ ticker: today.ticker, date: today.date, sourceId: "cross", kind: "product_divergence", z: pd / 0.1, description: "Product sentiment far below investment sentiment" });
  }
  return ev;
}
