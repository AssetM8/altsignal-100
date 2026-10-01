/**
 * Signal configuration. Every number that shapes a score lives here and is
 * documented in METHODOLOGY.md. Nothing in this file references prices,
 * returns, valuation or fundamentals.
 */
export const SOURCE_IDS = ["reddit", "hackernews", "wikipedia", "search", "github"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const TEXT_SOURCES: readonly SourceId[] = ["reddit", "hackernews"];
/** Sources whose information is least overlapping with retail social chatter. */
export const UNUSUAL_SOURCES: readonly SourceId[] = ["wikipedia", "github", "search"];

/** Relative trust in each source's attention measure when blending. */
export const SOURCE_ATTENTION_WEIGHTS: Record<SourceId, number> = {
  reddit: 0.3,
  hackernews: 0.15,
  wikipedia: 0.25,
  search: 0.2,
  github: 0.1,
};

/** Only text sources carry sentiment. */
export const SOURCE_SENTIMENT_WEIGHTS: Partial<Record<SourceId, number>> = {
  reddit: 0.65,
  hackernews: 0.35,
};

/** Aspect weights when collapsing aspect sentiment into one tone figure. */
export const ASPECT_WEIGHTS = { investment: 1.0, reputation: 0.75, product: 0.5, general: 0.6 } as const;

export const COMPONENT_KEYS = [
  "abnormalAttention",
  "sentiment",
  "attentionAcceleration",
  "sentimentAcceleration",
  "confirmation",
  "unusualSource",
] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

/**
 * Default composite weights. Starting framework was 30/25/20/10/10/5.
 * Change made after inspecting the data: sentiment raised 25→30 and
 * abnormal attention lowered 30→25, because attention is undirected and is
 * signed by tone (see METHODOLOGY.md §5) — letting it dominate made the score
 * a loudness meter. Weights are user-configurable in the Signal Lab.
 */
export const DEFAULT_WEIGHTS: Record<ComponentKey, number> = {
  abnormalAttention: 0.25,
  sentiment: 0.3,
  attentionAcceleration: 0.2,
  sentimentAcceleration: 0.1,
  confirmation: 0.1,
  unusualSource: 0.05,
};

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  abnormalAttention: "Abnormal attention (tone-signed)",
  sentiment: "Engagement-weighted sentiment",
  attentionAcceleration: "Attention acceleration (tone-signed)",
  sentimentAcceleration: "Sentiment acceleration",
  confirmation: "Cross-source confirmation",
  unusualSource: "Unusual-source bonus",
};

export const BASELINE = {
  /** Short window for current level, days (inclusive of t). */
  shortWindow: 7,
  /** Baseline window length, days, ending before the short window. */
  baselineWindow: 30,
  /** Minimum baseline 7-day means (out of 30) required to compute a z-score. */
  minBaselineObs: 20,
  /** Minimum non-missing observations inside the short window. */
  minShortObs: 4,
  /** z-scores are clipped to ±zClip (winsorization). */
  zClip: 4,
  /** Robust scale floor so near-constant series do not explode. */
  scaleFloor: 0.08,
} as const;

export const SENTIMENT = {
  /** Bayesian shrinkage: prior of k neutral mentions pulls thin samples to 0. */
  shrinkageK: 4,
  /** Aspect-level sentiment (product / investment / reputation) is sparser: shrink harder. */
  aspectShrinkageK: 6,
  /** Minimum text mentions in the short window to report sentiment at all. */
  minMentions: 3,
} as const;

export const CONFIDENCE = {
  /** Mentions at which the sample-size factor reaches ~63%. */
  sampleScale: 40,
  /** Data older than this (days) begins to be penalised as stale. */
  staleAfterDays: 2,
  /** Exponents for coverage, sample, freshness and quality factors. */
  exponents: { coverage: 0.35, sample: 0.3, freshness: 0.15, quality: 0.2 },
} as const;

/** Penalties shrink the composite toward neutral (50). Total capped at maxTotal. */
export const PENALTIES = {
  tinySample: { threshold: 15, amount: 0.3 },
  duplicates: { threshold: 0.3, amount: 0.2 },
  singleSource: { dominanceShare: 0.8, amount: 0.15 },
  stale: { amount: 0.15 },
  ambiguity: { threshold: 0.3, amount: 0.1 },
  bots: { threshold: 0.15, amount: 0.2 },
  hype: { zSingle: 3, zOthers: 1, amount: 0.2 },
  maxTotal: 0.8,
} as const;

export const ANOMALY = {
  /** |z| at or above which an anomaly event is recorded. */
  eventZ: 3.5,
  /** Days after an event during which the same ticker/source/kind is not re-reported. */
  refractoryDays: 7,
} as const;

export const HISTORY_DAYS = 240;
export const DOCUMENT_RETENTION_DAYS = 45;
