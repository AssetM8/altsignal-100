import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { COMPONENT_KEYS, DEFAULT_WEIGHTS, SOURCE_IDS, type ComponentKey, type SourceId } from "@/config/signal";
import { getDb } from "../db/client";
import * as t from "../db/schema";
import { computeSignalsForDate, normalizeWeights, type CompanySignal } from "../signals/composite";
import {
  computeDateStat,
  groupIc,
  spreadCurve,
  splitDates,
  summarize,
  walkForward,
  type CrossSection,
  type DateStat,
  type Observation,
} from "../backtest/engine";
import { Rng } from "../util/rng";
import { addDays, isWeekday } from "../util/dates";
import { mean, median, zscoreCross } from "../util/stats";
import { getComponents, getDataset, type Dataset } from "./dataset";
import { LAB_FEATURES } from "@/config/lab";

/** Features the Lab can test. Every one is derived from alternative data only. */
export const FEATURE_CATALOG = {
  altSignalScore: { label: LAB_FEATURES.altSignalScore, get: (s: CompanySignal) => s.altSignalScore },
  attentionScore: { label: LAB_FEATURES.attentionScore, get: (s: CompanySignal) => s.attentionScore },
  sentimentScore: { label: LAB_FEATURES.sentimentScore, get: (s: CompanySignal) => s.sentimentScore },
  attentionAcceleration: { label: LAB_FEATURES.attentionAcceleration, get: (s: CompanySignal) => s.attentionAcceleration },
  sentimentChange: { label: LAB_FEATURES.sentimentChange, get: (s: CompanySignal) => s.sentimentChange },
  agreement: { label: LAB_FEATURES.agreement, get: (s: CompanySignal) => s.agreement },
  divergence: { label: LAB_FEATURES.divergence, get: (s: CompanySignal) => s.divergence },
  wikiShock: { label: LAB_FEATURES.wikiShock, get: (s: CompanySignal) => s.unusual.wikiShock },
  productDivergence: { label: LAB_FEATURES.productDivergence, get: (s: CompanySignal) => s.unusual.productDivergence },
  devAcceleration: { label: LAB_FEATURES.devAcceleration, get: (s: CompanySignal) => s.unusual.devAcceleration },
  communityBreadth: { label: LAB_FEATURES.communityBreadth, get: (s: CompanySignal) => s.unusual.communityBreadth },
  retailCrowding: { label: LAB_FEATURES.retailCrowding, get: (s: CompanySignal) => s.unusual.retailCrowding },
  searchAcceleration: { label: LAB_FEATURES.searchAcceleration, get: (s: CompanySignal) => s.unusual.searchAcceleration },
} as const;
export type FeatureKey = keyof typeof FEATURE_CATALOG;
const FEATURE_KEYS = Object.keys(FEATURE_CATALOG) as [FeatureKey, ...FeatureKey[]];

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const LabParamsSchema = z.object({
  features: z.array(z.enum(FEATURE_KEYS)).min(1).max(4).default(["altSignalScore"]),
  featureWeights: z.array(z.number().min(-5).max(5)).max(4).optional(),
  componentWeights: z.record(z.enum(COMPONENT_KEYS as unknown as [ComponentKey, ...ComponentKey[]]), z.number().min(0).max(1)).optional(),
  excludeSources: z.array(z.enum(SOURCE_IDS)).max(4).default([]),
  horizon: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(20)]).default(5),
  start: DateKey.optional(),
  end: DateKey.optional(),
  universe: z.enum(["all", "top50", "top25"]).default("all"),
  sectors: z.array(z.string().max(60)).max(12).default([]),
  minConfidence: z.number().min(0).max(100).default(0),
});
export type LabParams = z.infer<typeof LabParamsSchema>;

type SignalPanel = Map<string, Map<string, CompanySignal>>;

async function loadLabels(horizon: number): Promise<Map<string, number>> {
  const rows = await getDb().select().from(t.forwardReturns).where(eq(t.forwardReturns.horizon, horizon));
  return new Map(rows.map((r) => [`${r.ticker}|${r.signalDate}`, r.ret]));
}

async function panelFor(ds: Dataset, weights: Partial<Record<ComponentKey, number>> | undefined, exclude: SourceId[]): Promise<SignalPanel> {
  const defaultW = normalizeWeights(DEFAULT_WEIGHTS);
  const w = normalizeWeights(weights);
  const custom = COMPONENT_KEYS.some((k) => Math.abs(w[k] - defaultW[k]) > 1e-9) || exclude.length > 0;
  if (!custom) return ds.signals;
  const comps = await getComponents();
  const out: SignalPanel = new Map();
  for (const d of ds.dates) {
    const sigs = computeSignalsForDate(d, comps.get(d) ?? new Map(), { weights: w, expectedSources: ds.expectedSources, excludeSources: [...exclude, ...ds.meta.runtimeDisabled] });
    out.set(d, new Map(sigs.map((s) => [s.ticker, s])));
  }
  return out;
}

function buildSections(ds: Dataset, panel: SignalPanel, labels: Map<string, number>, p: LabParams, signalFn: (date: string, sigs: Map<string, CompanySignal>, eligible: string[]) => Map<string, number>, dates: string[]): CrossSection[] {
  const universe = ds.companies
    .filter((c) => (p.universe === "top50" ? c.rank <= 50 : p.universe === "top25" ? c.rank <= 25 : true))
    .filter((c) => !p.sectors.length || p.sectors.includes(c.sector));
  return dates.map((date) => {
    const sigs = panel.get(date) ?? new Map();
    const eligible = universe.filter((c) => (sigs.get(c.ticker)?.confidence ?? 0) >= p.minConfidence).map((c) => c.ticker);
    const values = signalFn(date, sigs, eligible);
    const obs: Observation[] = [];
    for (const tk of eligible) {
      const v = values.get(tk);
      const r = labels.get(`${tk}|${date}`);
      if (v === undefined || r === undefined) continue;
      obs.push({ ticker: tk, sector: ds.companyByTicker.get(tk)?.sector ?? "?", signal: v, ret: r });
    }
    return { date, obs, eligible: universe.length };
  });
}

/** Combined signal: raw feature if one; weighted sum of cross-sectional z-scores if several. */
function combinedSignal(features: FeatureKey[], weights: number[] | undefined) {
  return (_date: string, sigs: Map<string, CompanySignal>, eligible: string[]) => {
    const out = new Map<string, number>();
    if (features.length === 1) {
      const f = FEATURE_CATALOG[features[0] as FeatureKey];
      for (const tk of eligible) {
        const s = sigs.get(tk);
        const v = s ? f.get(s) : null;
        if (v !== null && v !== undefined) out.set(tk, v);
      }
      return out;
    }
    const zs = features.map((fk) => zscoreCross(eligible.map((tk) => { const s = sigs.get(tk); return s ? FEATURE_CATALOG[fk].get(s) : null; })));
    eligible.forEach((tk, i) => {
      let acc = 0;
      let any = false;
      features.forEach((_, j) => {
        const v = zs[j]?.[i];
        if (v !== null && v !== undefined) { acc += (weights?.[j] ?? 1) * v; any = true; }
      });
      if (any) out.set(tk, acc);
    });
    return out;
  };
}

function statsOf(sections: CrossSection[]): DateStat[] {
  return sections.map(computeDateStat).filter((x): x is DateStat => x !== null);
}

export async function runSignalLab(input: unknown) {
  const p = LabParamsSchema.parse(input);
  const t0 = Date.now();
  const ds = await getDataset();
  if (!ds.meta.pricesAvailable) {
    return { ok: false as const, error: "No market-data provider configured: forward-return labels are unavailable. Configure a licensed price provider (see DATA_SOURCES.md) or use demo mode." };
  }
  const labels = await loadLabels(p.horizon);
  // Default start skips the 37-day baseline warm-up, matching the Lab form's default.
  const warmStart = ds.dates[0] ? addDays(ds.dates[0], 37) : "";
  const startDate = p.start ?? warmStart;
  const allDates = ds.dates.filter((d) => isWeekday(d) && d >= startDate && (!p.end || d <= p.end));
  const panel = await panelFor(ds, p.componentWeights, p.excludeSources);

  const main = buildSections(ds, panel, labels, p, combinedSignal(p.features, p.featureWeights), allDates);
  const stats = statsOf(main);
  if (stats.length < 10) {
    return { ok: false as const, error: `Only ${stats.length} usable cross-sections (need ≥ 10 dates with ≥ 20 names and labels). Widen the date range, universe or lower the confidence filter.` };
  }
  const summary = summarize(stats, p.horizon);

  // Quintile mean / median of pooled forward returns.
  const pooled: number[][] = [[], [], [], [], []];
  for (const cs of main) {
    if (cs.obs.length < 20) continue;
    const sorted = [...cs.obs].sort((a, b) => a.signal - b.signal);
    sorted.forEach((o, i) => (pooled[Math.min(4, Math.floor((i * 5) / sorted.length))] as number[]).push(o.ret));
  }
  const quintiles = pooled.map((arr, i) => ({ quintile: i + 1, mean: mean(arr), median: median(arr), n: arr.length }));

  const curve = spreadCurve(stats, p.horizon);
  const splits = splitDates(stats);
  const splitSummary = Object.fromEntries(
    (["calibration", "validation", "test"] as const).map((k) => [k, { start: splits[k][0]?.date ?? null, end: splits[k].at(-1)?.date ?? null, ...summarize(splits[k], p.horizon) }]),
  );

  // Walk-forward over the individual features and the combination.
  const candidates: Record<string, DateStat[]> = {};
  if (p.features.length > 1) candidates.combined = stats;
  for (const f of p.features) candidates[f] = statsOf(buildSections(ds, panel, labels, p, combinedSignal([f], undefined), allDates));
  const wf = walkForward(candidates, 4, Math.max(20, Math.floor(stats.length * 0.4)));

  // Baselines on identical eligibility.
  const rng = new Rng(42);
  const randomStats = statsOf(buildSections(ds, panel, labels, p, (_d, _s, elig) => new Map(elig.map((tk) => [tk, rng.normal()])), allDates));
  const baselineDefs: [string, DateStat[]][] = [
    ["Random signal (seeded)", randomStats],
    ["Attention Score only", statsOf(buildSections(ds, ds.signals, labels, p, combinedSignal(["attentionScore"], undefined), allDates))],
    ["Default composite", statsOf(buildSections(ds, ds.signals, labels, p, combinedSignal(["altSignalScore"], undefined), allDates))],
  ];
  const baselines = baselineDefs.map(([name, st]) => ({ name, ...summarize(st, p.horizon) }));

  const bySector = groupIc(main, (o) => o.sector, p.horizon);
  const byMonth = Array.from(new Set(stats.map((s) => s.date.slice(0, 7)))).map((month) => {
    const sub = stats.filter((s) => s.date.startsWith(month));
    const sm = summarize(sub, p.horizon);
    return { group: month, dates: sub.length, meanRankIc: sm.meanRankIc, tStat: sm.tStat, meanSpread: sm.meanSpread };
  });

  // Regime: days when universe-average sentiment is above vs below its median.
  const moodByDate = new Map(allDates.map((d) => [d, mean(Array.from((ds.signals.get(d) ?? new Map()).values()).map((s) => s.sentimentScore))]));
  const moodMedian = median(Array.from(moodByDate.values()));
  const regimes = moodMedian === null ? [] : (["risk-on mood", "risk-off mood"] as const).map((name, i) => {
    const sub = stats.filter((s) => { const m = moodByDate.get(s.date); return m !== null && m !== undefined && (i === 0 ? m >= moodMedian : m < moodMedian); });
    const sm = summarize(sub, p.horizon);
    return { group: name, dates: sub.length, meanRankIc: sm.meanRankIc, tStat: sm.tStat };
  });

  // Sensitivity: minimum data confidence (a proxy for minimum sample size).
  const confidenceSensitivity = [0, 25, 50, 70].map((mc) => {
    const st = statsOf(buildSections(ds, panel, labels, { ...p, minConfidence: Math.max(mc, p.minConfidence) }, combinedSignal(p.features, p.featureWeights), allDates));
    const sm = st.length >= 5 ? summarize(st, p.horizon) : null;
    return { minConfidence: Math.max(mc, p.minConfidence), dates: st.length, meanRankIc: sm?.meanRankIc ?? null, tStat: sm?.tStat ?? null };
  });

  // Sensitivity: remove one alternative-data source at a time (composite-based features only).
  const sourceRemoval: { removed: string; meanRankIc: number | null; tStat: number | null }[] = [];
  const compositeDerived: FeatureKey[] = ["altSignalScore", "attentionScore", "sentimentScore", "attentionAcceleration", "sentimentChange", "agreement", "divergence"];
  if (p.features.some((f) => compositeDerived.includes(f))) {
    for (const s of SOURCE_IDS) {
      if (p.excludeSources.includes(s) || ds.meta.runtimeDisabled.includes(s)) continue;
      const pn = await panelFor(ds, p.componentWeights, [...p.excludeSources, s]);
      const st = statsOf(buildSections(ds, pn, labels, p, combinedSignal(p.features, p.featureWeights), allDates));
      const sm = st.length >= 5 ? summarize(st, p.horizon) : null;
      sourceRemoval.push({ removed: s, meanRankIc: sm?.meanRankIc ?? null, tStat: sm?.tStat ?? null });
    }
  }

  const coverage = mean(main.map((cs) => (cs.eligible ? cs.obs.length / cs.eligible : null)));
  const coverageFirst = mean(main.slice(0, 10).map((cs) => (cs.eligible ? cs.obs.length / cs.eligible : null)));
  const coverageLast = mean(main.slice(-10).map((cs) => (cs.eligible ? cs.obs.length / cs.eligible : null)));

  // Integrity checks that can be verified mechanically.
  const integrity = await integrityChecks(p.horizon, ds);

  const oosT = splitSummary.test as { tStat: number | null; meanRankIc: number | null };
  const verdict =
    oosT.meanRankIc !== null && oosT.tStat !== null && Math.abs(oosT.tStat) >= 2 && Math.sign(oosT.meanRankIc) === Math.sign(summary.meanRankIc ?? 0)
      ? `Showed ${oosT.meanRankIc > 0 ? "positive" : "negative"} rank correlation with subsequent ${p.horizon}-day returns, including in the held-out test period (t = ${oosT.tStat.toFixed(2)}).`
      : `Did not demonstrate stable out-of-sample performance: the held-out test period ${oosT.tStat === null ? "had too few observations" : `had t = ${oosT.tStat.toFixed(2)}`}.`;

  const warnings = [
    ...(ds.meta.pricesSynthetic ? ["DEMO DATA: both the alternative-data signals and the price labels are synthetic. The demo prices contain a deliberately planted, documented link to latent tone (ALTSIGNAL_PLANTED_COUPLING) so the mechanics can be shown. Nothing here describes real markets."] : []),
    "Multiple testing: every additional feature, horizon or weight set you try raises the chance of a spurious result. Treat |t| < 3 with suspicion after several trials.",
    `Survivorship bias: the universe is the ${ds.meta.universeAsOf} snapshot applied to all history; companies that left the top 100 (or were delisted) during the window are missing.`,
    "Overlapping returns: mean IC uses every trading day, but t-statistics, CIs and the spread curve use non-overlapping rebalance dates only.",
    `Transaction costs and turnover are not deducted. Top-quintile turnover averaged ${curve.turnoverTop === null ? "n/a" : `${Math.round(curve.turnoverTop * 100)}%`} per rebalance.`,
    ...(coverageFirst !== null && coverageLast !== null && Math.abs(coverageLast - coverageFirst) > 0.1 ? [`Source coverage changed over the window (${Math.round(coverageFirst * 100)}% → ${Math.round(coverageLast * 100)}% of the universe had a signal).`] : []),
    "This is a research tool, not investment advice. An in-sample association is not evidence of predictability.",
  ];

  const result = {
    params: p,
    featureLabels: p.features.map((f) => FEATURE_CATALOG[f].label),
    componentWeights: normalizeWeights(p.componentWeights),
    verdict,
    summary,
    quintiles,
    curve,
    splits: splitSummary,
    walkForward: wf,
    baselines,
    bySector,
    byMonth,
    regimes,
    sensitivity: { confidence: confidenceSensitivity, sourceRemoval },
    coverage,
    integrity,
    icSeries: stats.map((s) => ({ date: s.date, rankIc: s.rankIc, ic: s.ic, n: s.n })),
    warnings,
    isSynthetic: ds.meta.isSynthetic,
    durationMs: Date.now() - t0,
  };

  const id = randomUUID();
  const db = getDb();
  await db.insert(t.backtestRuns).values({ id, createdAt: new Date().toISOString(), paramsJson: JSON.stringify(p), status: "succeeded", durationMs: result.durationMs, isSynthetic: ds.meta.isSynthetic });
  await db.insert(t.backtestResults).values({ runId: id, resultJson: JSON.stringify(result) });
  return { ok: true as const, runId: id, result };
}

export type LabResult = Extract<Awaited<ReturnType<typeof runSignalLab>>, { ok: true }>["result"];

async function integrityChecks(horizon: number, ds: Dataset) {
  const db = getDb();
  const rows = await db.select().from(t.forwardReturns).where(eq(t.forwardReturns.horizon, horizon));
  const badEntry = rows.filter((r) => r.entryDate <= r.signalDate).length;
  const badExit = rows.filter((r) => r.exitDate <= r.entryDate).length;
  // Feature timestamps: every per-source feature's last observation must be ≤ its date.
  const comps = await getComponents();
  let featureViolations = 0;
  let checked = 0;
  for (const [date, m] of comps) {
    for (const f of m.values()) {
      for (const sf of Object.values(f)) {
        checked++;
        if (sf?.lastObservedDate && sf.lastObservedDate > date) featureViolations++;
      }
    }
  }
  return {
    labelsChecked: rows.length,
    labelsEnteringAfterSignal: badEntry === 0,
    exitsAfterEntry: badExit === 0,
    featureRowsChecked: checked,
    noFutureObservationsInFeatures: featureViolations === 0,
    timezone: "All alt-data days are UTC calendar days; signals dated d use items published before 24:00 UTC on d; entry is the next trading-day close.",
    modelVersion: ds.meta.compositeModel,
  };
}

export async function getLabRun(id: string) {
  const db = getDb();
  const [run] = await db.select().from(t.backtestRuns).where(eq(t.backtestRuns.id, id));
  if (!run) return null;
  const [res] = await db.select().from(t.backtestResults).where(eq(t.backtestResults.runId, id));
  return { run: { ...run, params: JSON.parse(run.paramsJson) as LabParams }, result: res ? (JSON.parse(res.resultJson) as LabResult) : null };
}
