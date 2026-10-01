import { ASPECT_WEIGHTS, BASELINE, SENTIMENT, type SourceId } from "@/config/signal";
import { clip, mad, mean, median, std } from "../util/stats";
import { addDays } from "../util/dates";

/**
 * Point-in-time per-source features.
 *
 * Every feature for date t is computed from observations dated ≤ t only.
 * Missing days are kept missing (never zero-filled): a text source that was
 * collected on a day but had no mentions has an explicit 0-count row; a day
 * the source was not collected has no row at all.
 */

export interface DailyMetricRow {
  date: string;
  value: number;
  mentionCount?: number | null;
  uniqueAuthors?: number | null;
  engagementAdj?: number | null;
  posShare?: number | null;
  negShare?: number | null;
  netSentiment?: number | null;
  sentimentWeight?: number | null;
  sentimentConfidence?: number | null;
  investmentSentiment?: number | null;
  productSentiment?: number | null;
  reputationSentiment?: number | null;
  dupRatio?: number | null;
  botRatio?: number | null;
  ambiguityRatio?: number | null;
  communityCount?: number | null;
  communityHhi?: number | null;
}

export interface SourceFeatures {
  date: string;
  source: SourceId;
  /** True when enough recent observations exist to use this source today. */
  available: boolean;
  obsShort: number;
  obsBaseline: number;
  lastObservedDate: string | null;
  freshnessDays: number | null;
  /** Raw activity level over the short window (mean of daily values). */
  activity7: number | null;
  abnormalZ: number | null;
  accelZ: number | null;
  // text-only
  mentions7: number | null;
  authors7: number | null;
  engagement7: number | null;
  sentiment7: number | null;
  sentimentPrev7: number | null;
  sentimentChange: number | null;
  posShare7: number | null;
  negShare7: number | null;
  sentimentConfidence7: number | null;
  investment7: number | null;
  product7: number | null;
  reputation7: number | null;
  dupRatio7: number | null;
  botRatio7: number | null;
  ambiguity7: number | null;
  breadth7: number | null;
}

const isText = (s: SourceId) => s === "reddit" || s === "hackernews";

/** Attention level used for z-scores: log engagement-adjusted mentions (text) or log value (numeric). */
export function attentionLevel(source: SourceId, r: DailyMetricRow): number {
  return Math.log1p(isText(source) ? (r.engagementAdj ?? r.value) : r.value);
}

function window(byDate: Map<string, DailyMetricRow>, t: string, fromOffset: number, toOffset: number): DailyMetricRow[] {
  const out: DailyMetricRow[] = [];
  for (let k = fromOffset; k <= toOffset; k++) {
    const r = byDate.get(addDays(t, -k));
    if (r) out.push(r);
  }
  return out;
}

/** Bayesian-shrunk weighted mean of a per-day sentiment field over rows. */
function shrunkSentiment(rows: DailyMetricRow[], field: keyof DailyMetricRow, k: number): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const v = r[field];
    const w = r.sentimentWeight ?? 0;
    if (typeof v === "number" && Number.isFinite(v) && w > 0) {
      num += v * w;
      den += w;
    }
  }
  if (den === 0) return null;
  return num / (den + k);
}

export function computeSourceFeatures(source: SourceId, rows: DailyMetricRow[], dates: string[]): SourceFeatures[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const sortedDates = rows.map((r) => r.date).sort();
  const out: SourceFeatures[] = [];
  const text = isText(source);
  let lastIdx = -1;

  // Rolling short-window mean of the attention level, defined only with enough observations.
  // Computed for every calendar day from the earliest needed baseline day to the last date.
  const rollingMean = new Map<string, number>();
  const firstNeeded = dates.length ? addDays(dates[0] as string, -(BASELINE.shortWindow + BASELINE.baselineWindow)) : null;
  if (firstNeeded) {
    for (let d = firstNeeded; d <= (dates.at(-1) as string); d = addDays(d, 1)) {
      const w = window(byDate, d, 0, BASELINE.shortWindow - 1);
      if (w.length >= BASELINE.minShortObs) rollingMean.set(d, mean(w.map((r) => attentionLevel(source, r))) as number);
    }
  }

  for (const t of dates) {
    while (lastIdx + 1 < sortedDates.length && (sortedDates[lastIdx + 1] as string) <= t) lastIdx++;
    const lastObserved = lastIdx >= 0 ? (sortedDates[lastIdx] as string) : null;
    const freshness = lastObserved ? Math.round((Date.parse(t) - Date.parse(lastObserved)) / 86_400_000) : null;

    const short = window(byDate, t, 0, BASELINE.shortWindow - 1);
    const current = rollingMean.get(t) ?? null;
    // Baseline: the distribution of past 7-day means ending t-7 … t-36 (no overlap with the current window).
    const baseMeans: number[] = [];
    for (let k = BASELINE.shortWindow; k < BASELINE.shortWindow + BASELINE.baselineWindow; k++) {
      const v = rollingMean.get(addDays(t, -k));
      if (v !== undefined) baseMeans.push(v);
    }

    let abnormalZ: number | null = null;
    let accelZ: number | null = null;
    const enough = current !== null && baseMeans.length >= BASELINE.minBaselineObs;
    const obsBaseline = baseMeans.length;
    if (enough) {
      const center = median(baseMeans) as number;
      const scale = Math.max(mad(baseMeans) ?? 0, std(baseMeans) ?? 0, BASELINE.scaleFloor);
      abnormalZ = clip((current - center) / scale, -BASELINE.zClip, BASELINE.zClip);
      const recent = window(byDate, t, 0, 2).map((r) => attentionLevel(source, r));
      const prior = window(byDate, t, 3, 9).map((r) => attentionLevel(source, r));
      if (recent.length >= 2 && prior.length >= 4) {
        // Per-day level change is noisier than 7-day means; scale by daily dispersion.
        const dailyScale = Math.max(std(window(byDate, t, 7, 36).map((r) => attentionLevel(source, r))) ?? 0, BASELINE.scaleFloor);
        accelZ = clip(((mean(recent) as number) - (mean(prior) as number)) / (dailyScale / Math.sqrt(2)), -BASELINE.zClip, BASELINE.zClip);
      }
    }

    const f: SourceFeatures = {
      date: t,
      source,
      available: enough && freshness !== null && freshness <= 7,
      obsShort: short.length,
      obsBaseline,
      lastObservedDate: lastObserved,
      freshnessDays: freshness,
      activity7: short.length ? (mean(short.map((r) => r.value)) as number) : null,
      abnormalZ,
      accelZ,
      mentions7: null,
      authors7: null,
      engagement7: null,
      sentiment7: null,
      sentimentPrev7: null,
      sentimentChange: null,
      posShare7: null,
      negShare7: null,
      sentimentConfidence7: null,
      investment7: null,
      product7: null,
      reputation7: null,
      dupRatio7: null,
      botRatio7: null,
      ambiguity7: null,
      breadth7: null,
    };

    if (text && short.length) {
      const mentions = short.reduce((a, r) => a + (r.mentionCount ?? 0), 0);
      f.mentions7 = mentions;
      f.authors7 = short.reduce((a, r) => a + (r.uniqueAuthors ?? 0), 0);
      f.engagement7 = short.reduce((a, r) => a + (r.engagementAdj ?? 0), 0);
      if (mentions >= SENTIMENT.minMentions) {
        f.sentiment7 = shrunkSentiment(short, "netSentiment", SENTIMENT.shrinkageK);
        f.posShare7 = weighted(short, "posShare");
        f.negShare7 = weighted(short, "negShare");
        f.sentimentConfidence7 = weighted(short, "sentimentConfidence");
        f.investment7 = shrunkSentiment(short, "investmentSentiment", SENTIMENT.aspectShrinkageK);
        f.product7 = shrunkSentiment(short, "productSentiment", SENTIMENT.aspectShrinkageK);
        f.reputation7 = shrunkSentiment(short, "reputationSentiment", SENTIMENT.aspectShrinkageK);
      }
      const prev = window(byDate, t, 7, 13);
      const prevMentions = prev.reduce((a, r) => a + (r.mentionCount ?? 0), 0);
      if (prevMentions >= SENTIMENT.minMentions) f.sentimentPrev7 = shrunkSentiment(prev, "netSentiment", SENTIMENT.shrinkageK);
      if (f.sentiment7 !== null && f.sentimentPrev7 !== null) f.sentimentChange = f.sentiment7 - f.sentimentPrev7;
      const totalIn = short.reduce((a, r) => a + (r.mentionCount ?? 0), 0);
      f.dupRatio7 = totalIn ? weightedBy(short, "dupRatio", "mentionCount") : null;
      f.botRatio7 = totalIn ? weightedBy(short, "botRatio", "mentionCount") : null;
      f.ambiguity7 = totalIn ? weightedBy(short, "ambiguityRatio", "mentionCount") : null;
      const breadth = short.filter((r) => (r.communityHhi ?? 0) > 0).map((r) => ({ v: 1 / (r.communityHhi as number), w: r.mentionCount ?? 0 }));
      const bw = breadth.reduce((a, b) => a + b.w, 0);
      f.breadth7 = bw ? breadth.reduce((a, b) => a + b.v * b.w, 0) / bw : null;
    }
    out.push(f);
  }
  return out;
}

function weighted(rows: DailyMetricRow[], field: keyof DailyMetricRow): number | null {
  return weightedBy(rows, field, "sentimentWeight");
}

function weightedBy(rows: DailyMetricRow[], field: keyof DailyMetricRow, wField: keyof DailyMetricRow): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const v = r[field];
    const w = r[wField];
    if (typeof v === "number" && typeof w === "number" && w > 0) {
      num += v * w;
      den += w;
    }
  }
  return den ? num / den : null;
}

export { ASPECT_WEIGHTS };
