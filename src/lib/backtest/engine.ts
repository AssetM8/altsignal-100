import { Rng } from "../util/rng";
import { clip, mean, median, pearson, quantile, spearman, std, tStat } from "../util/stats";

/**
 * Cross-sectional research engine for the Signal Lab.
 *
 * Inputs are already point-in-time signal values (computed from data dated
 * ≤ signal date) and forward-return labels that start at the NEXT trading
 * close. The engine never sees prices directly, only labels.
 */

export interface Observation {
  ticker: string;
  sector: string;
  signal: number;
  ret: number;
}

export interface CrossSection {
  date: string;
  obs: Observation[];
  /** Eligible universe size after filters (with or without a signal), for coverage. */
  eligible: number;
}

export interface DateStat {
  date: string;
  n: number;
  ic: number | null;
  rankIc: number | null;
  quintileMeans: (number | null)[];
  spread: number | null;
  hitRate: number | null;
  top: string[];
  bottom: string[];
}

export interface SummaryStats {
  dates: number;
  nonOverlappingDates: number;
  observations: number;
  meanIc: number | null;
  meanRankIc: number | null;
  icStd: number | null;
  icIr: number | null;
  tStat: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  bootstrapCiLow: number | null;
  bootstrapCiHigh: number | null;
  hitRate: number | null;
  meanSpread: number | null;
  spreadTStat: number | null;
  positiveIcShare: number | null;
}

export const MIN_CROSS_SECTION = 20;

export function computeDateStat(cs: CrossSection): DateStat | null {
  const obs = cs.obs;
  if (obs.length < MIN_CROSS_SECTION) return null;
  const s = obs.map((o) => o.signal);
  const r = obs.map((o) => o.ret);
  const sorted = [...obs].sort((a, b) => a.signal - b.signal);
  const q: Observation[][] = [[], [], [], [], []];
  sorted.forEach((o, i) => (q[Math.min(4, Math.floor((i * 5) / sorted.length))] as Observation[]).push(o));
  const qm = q.map((b) => mean(b.map((o) => o.ret)));
  const ms = median(s) as number;
  const mr = median(r) as number;
  let hits = 0;
  let counted = 0;
  for (const o of obs) {
    if (o.signal === ms || o.ret === mr) continue;
    counted++;
    if (o.signal > ms === o.ret > mr) hits++;
  }
  const top = qm[4];
  const bottom = qm[0];
  return {
    date: cs.date,
    n: obs.length,
    ic: pearson(s, r),
    rankIc: spearman(s, r),
    quintileMeans: qm,
    spread: top !== null && top !== undefined && bottom !== null && bottom !== undefined ? top - bottom : null,
    hitRate: counted ? hits / counted : null,
    top: (q[4] as Observation[]).map((o) => o.ticker),
    bottom: (q[0] as Observation[]).map((o) => o.ticker),
  };
}

/** Every `step`-th date — non-overlapping forward-return windows for inference. */
export function nonOverlapping<T>(xs: T[], step: number): T[] {
  return xs.filter((_, i) => i % Math.max(1, step) === 0);
}

export function blockBootstrapMeanCi(xs: number[], blockLen: number, iters = 1000, seed = 7): [number, number] | null {
  if (xs.length < 8) return null;
  const rng = new Rng(seed);
  const means: number[] = [];
  const b = Math.max(1, Math.min(blockLen, Math.floor(xs.length / 4)));
  for (let it = 0; it < iters; it++) {
    const sample: number[] = [];
    while (sample.length < xs.length) {
      const start = rng.int(0, xs.length - b);
      for (let k = 0; k < b && sample.length < xs.length; k++) sample.push(xs[start + k] as number);
    }
    means.push(mean(sample) as number);
  }
  return [quantile(means, 0.025) as number, quantile(means, 0.975) as number];
}

export function summarize(stats: DateStat[], horizon: number): SummaryStats {
  const ics = stats.map((s) => s.rankIc).filter((x): x is number => x !== null);
  const pics = stats.map((s) => s.ic).filter((x): x is number => x !== null);
  // Inference on non-overlapping dates only (overlapping h-day returns are autocorrelated).
  const no = nonOverlapping(stats, horizon);
  const noIcs = no.map((s) => s.rankIc).filter((x): x is number => x !== null);
  const noSpreads = no.map((s) => s.spread).filter((x): x is number => x !== null);
  const sd = std(noIcs);
  const m = mean(noIcs);
  const se = sd && noIcs.length ? sd / Math.sqrt(noIcs.length) : null;
  const boot = blockBootstrapMeanCi(noIcs, 3);
  return {
    dates: stats.length,
    nonOverlappingDates: no.length,
    observations: stats.reduce((a, s) => a + s.n, 0),
    meanIc: mean(pics),
    meanRankIc: mean(ics),
    icStd: std(ics),
    icIr: mean(ics) !== null && std(ics) ? (mean(ics) as number) / (std(ics) as number) : null,
    tStat: tStat(noIcs),
    ciLow: m !== null && se !== null ? m - 1.96 * se : null,
    ciHigh: m !== null && se !== null ? m + 1.96 * se : null,
    bootstrapCiLow: boot ? boot[0] : null,
    bootstrapCiHigh: boot ? boot[1] : null,
    hitRate: mean(stats.map((s) => s.hitRate)),
    meanSpread: mean(noSpreads),
    spreadTStat: tStat(noSpreads),
    positiveIcShare: ics.length ? ics.filter((x) => x > 0).length / ics.length : null,
  };
}

export interface SpreadPoint {
  date: string;
  spread: number;
  cumulative: number;
  drawdown: number;
}

/** Cumulative (compounded) top-minus-bottom research spread on non-overlapping rebalances. */
export function spreadCurve(stats: DateStat[], horizon: number): { points: SpreadPoint[]; maxDrawdown: number; turnoverTop: number | null; turnoverBottom: number | null } {
  const no = nonOverlapping(stats, horizon).filter((s) => s.spread !== null);
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  const points: SpreadPoint[] = [];
  const tt: number[] = [];
  const tb: number[] = [];
  let prev: DateStat | null = null;
  for (const s of no) {
    equity *= 1 + clip(s.spread as number, -0.99, 10);
    peak = Math.max(peak, equity);
    const dd = equity / peak - 1;
    maxDd = Math.min(maxDd, dd);
    points.push({ date: s.date, spread: s.spread as number, cumulative: equity - 1, drawdown: dd });
    if (prev) {
      tt.push(turnover(prev.top, s.top));
      tb.push(turnover(prev.bottom, s.bottom));
    }
    prev = s;
  }
  return { points, maxDrawdown: maxDd, turnoverTop: mean(tt), turnoverBottom: mean(tb) };
}

export function turnover(prev: string[], next: string[]): number {
  if (!prev.length) return 0;
  const n = new Set(next);
  const kept = prev.filter((t) => n.has(t)).length;
  return 1 - kept / prev.length;
}

export interface GroupStat {
  group: string;
  dates: number;
  meanRankIc: number | null;
  tStat: number | null;
}

/** Mean within-group rank IC (e.g. by sector) — needs ≥ minN names per group per date. */
export function groupIc(sections: CrossSection[], groupOf: (o: Observation) => string, horizon: number, minN = 6): GroupStat[] {
  const byGroup = new Map<string, { date: string; ic: number }[]>();
  for (const cs of sections) {
    const groups = new Map<string, Observation[]>();
    for (const o of cs.obs) groups.set(groupOf(o), [...(groups.get(groupOf(o)) ?? []), o]);
    for (const [g, list] of groups) {
      if (list.length < minN) continue;
      const ic = spearman(list.map((o) => o.signal), list.map((o) => o.ret));
      if (ic === null) continue;
      byGroup.set(g, [...(byGroup.get(g) ?? []), { date: cs.date, ic }]);
    }
  }
  return Array.from(byGroup.entries())
    .map(([group, arr]) => {
      const no = nonOverlapping(arr, horizon).map((x) => x.ic);
      return { group, dates: arr.length, meanRankIc: mean(arr.map((x) => x.ic)), tStat: tStat(no) };
    })
    .sort((a, b) => a.group.localeCompare(b.group));
}

/** Chronological calibration / validation / test split of rebalance dates. */
export function splitDates<T extends { date: string }>(xs: T[], fractions: [number, number, number] = [0.6, 0.2, 0.2]): { calibration: T[]; validation: T[]; test: T[] } {
  const n = xs.length;
  const a = Math.floor(n * fractions[0]);
  const b = Math.floor(n * (fractions[0] + fractions[1]));
  return { calibration: xs.slice(0, a), validation: xs.slice(a, b), test: xs.slice(b) };
}

/**
 * Expanding-window walk-forward: for each fold, choose the sign (and, if
 * several candidates are given, the candidate) with the best mean rank IC on
 * all PRIOR dates, then record its rank IC on the fold's dates only.
 */
export function walkForward(
  candidates: Record<string, DateStat[]>,
  folds = 4,
  minTrain = 20,
): { folds: { start: string; end: string; chosen: string; sign: 1 | -1; trainIc: number | null; testIc: number | null }[]; oosMeanRankIc: number | null } {
  const names = Object.keys(candidates);
  const first = candidates[names[0] as string] ?? [];
  const dates = first.map((s) => s.date);
  if (dates.length < minTrain + folds) return { folds: [], oosMeanRankIc: null };
  const testSpan = Math.floor((dates.length - minTrain) / folds);
  const out = [];
  const oos: number[] = [];
  for (let f = 0; f < folds; f++) {
    const trainEnd = minTrain + f * testSpan;
    const testEnd = f === folds - 1 ? dates.length : trainEnd + testSpan;
    let best: { name: string; sign: 1 | -1; ic: number } | null = null;
    for (const nm of names) {
      const train = (candidates[nm] as DateStat[]).slice(0, trainEnd).map((s) => s.rankIc).filter((x): x is number => x !== null);
      const m = mean(train);
      if (m === null) continue;
      const sign: 1 | -1 = m >= 0 ? 1 : -1;
      if (!best || Math.abs(m) > best.ic) best = { name: nm, sign, ic: Math.abs(m) };
    }
    if (!best) continue;
    const test = (candidates[best.name] as DateStat[]).slice(trainEnd, testEnd).map((s) => s.rankIc).filter((x): x is number => x !== null).map((x) => x * best.sign);
    const tm = mean(test);
    if (tm !== null) oos.push(...test);
    out.push({ start: dates[trainEnd] as string, end: dates[testEnd - 1] as string, chosen: best.name, sign: best.sign, trainIc: best.ic * best.sign, testIc: tm });
  }
  return { folds: out, oosMeanRankIc: mean(oos) };
}
