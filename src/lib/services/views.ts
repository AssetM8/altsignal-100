import "server-only";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { SOURCE_IDS, TEXT_SOURCES, type SourceId } from "@/config/signal";
import { getDb } from "../db/client";
import * as t from "../db/schema";
import type { CompanySignal } from "../signals/composite";
import { addDays } from "../util/dates";
import { mean, quantile } from "../util/stats";
import { getDataset, getDailyMetrics, type CompanyInfo, type Dataset } from "./dataset";

/* ───────────────────────── query schemas ───────────────────────── */

export const WINDOWS = [7, 30, 90] as const;
export const ViewQuerySchema = z.object({
  window: z.coerce.number().refine((n) => (WINDOWS as readonly number[]).includes(n), "window must be 7, 30 or 90").default(30),
  source: z.enum(["all", ...SOURCE_IDS]).default("all"),
  sector: z.string().max(60).default("all"),
  minConfidence: z.coerce.number().min(0).max(100).default(0),
});
export type ViewQuery = z.infer<typeof ViewQuerySchema>;

export function parseViewQuery(sp: Record<string, string | string[] | undefined>): ViewQuery {
  const pick = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined));
  const r = ViewQuerySchema.safeParse({ window: pick("window"), source: pick("source"), sector: pick("sector"), minConfidence: pick("minConfidence") });
  return r.success ? r.data : ViewQuerySchema.parse({});
}

/* ───────────────────────── row model ───────────────────────── */

export interface StockRow {
  rank: number;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCapUsd: number;
  score: number | null;
  attention: number | null;
  sentiment: number | null;
  attentionAcceleration: number | null;
  sentimentChange: number | null;
  agreement: number | null;
  divergence: number | null;
  confidence: number;
  anomalyScore: number | null;
  hypeRisk: CompanySignal["hypeRisk"];
  scoreChange: number | null;
  freshnessDays: number | null;
  sourcesAvailable: SourceId[];
  sourcesExpected: SourceId[];
}

/**
 * Metric view for a company. With source = "all" it is the cross-source
 * composite; with a single source selected, attention and sentiment come from
 * that source only (the composite score is not defined for one source).
 */
function viewOf(s: CompanySignal | undefined, source: ViewQuery["source"]) {
  if (!s) return { score: null, attention: null, sentiment: null, accel: null };
  if (source === "all") return { score: s.altSignalScore, attention: s.attentionScore, sentiment: s.sentimentScore, accel: s.attentionAcceleration };
  const ps = s.perSource[source];
  if (!ps || !ps.available) return { score: null, attention: null, sentiment: null, accel: null };
  const z = ps.z;
  const attention = z === null ? null : Math.round(1000 * normalCdfApprox(z)) / 10;
  const sentiment = ps.sentiment === null ? null : Math.round(1000 * Math.tanh(2.5 * ps.sentiment)) / 10;
  return { score: null, attention, sentiment, accel: ps.accel === null ? null : Math.round(ps.accel * 100) / 100 };
}

function normalCdfApprox(z: number): number {
  return 1 / (1 + Math.exp(-1.702 * z));
}

export function buildRows(ds: Dataset, q: ViewQuery, date = ds.meta.asOf): StockRow[] {
  const today = ds.signals.get(date) ?? new Map<string, CompanySignal>();
  const past = ds.signals.get(addDays(date, -q.window));
  return ds.companies
    .filter((c) => q.sector === "all" || c.sector === q.sector)
    .map((c) => {
      const s = today.get(c.ticker);
      const v = viewOf(s, q.source);
      const pv = viewOf(past?.get(c.ticker), q.source);
      const fresh = s ? Object.values(s.perSource).filter((p) => p?.available).map((p) => p?.freshnessDays ?? 0) : [];
      return {
        rank: c.rank,
        ticker: c.ticker,
        name: c.name,
        sector: c.sector,
        industry: c.industry,
        marketCapUsd: c.marketCapUsd,
        score: v.score,
        attention: v.attention,
        sentiment: v.sentiment,
        attentionAcceleration: v.accel,
        sentimentChange: s?.sentimentChange ?? null,
        agreement: s?.agreement ?? null,
        divergence: s?.divergence ?? null,
        confidence: s?.confidence ?? 0,
        anomalyScore: s?.anomalyScore ?? null,
        hypeRisk: s?.hypeRisk ?? "low",
        scoreChange: v.score !== null && pv.score !== null ? Math.round((v.score - pv.score) * 10) / 10 : null,
        freshnessDays: fresh.length ? Math.max(...fresh) : null,
        sourcesAvailable: s?.sourcesAvailable ?? [],
        sourcesExpected: s?.sourcesExpected ?? [],
      } satisfies StockRow;
    })
    .filter((r) => r.confidence >= q.minConfidence);
}

/* ───────────────────────── overview ───────────────────────── */

export async function getOverview(q: ViewQuery) {
  const ds = await getDataset();
  const rows = buildRows(ds, q);
  const asOf = ds.meta.asOf;
  const start = addDays(asOf, -q.window + 1);
  const sectorFilter = (c: CompanyInfo) => q.sector === "all" || c.sector === q.sector;

  // Market mood = confidence-weighted mean sentiment across the (filtered) universe, per day.
  const moodSeries = ds.dates
    .filter((d) => d >= start && d <= asOf)
    .map((d) => {
      const day = buildRows(ds, { ...q, window: 7 }, d).filter((r) => r.sentiment !== null);
      const w = day.map((r) => Math.max(1, r.confidence));
      const tot = w.reduce((a, b) => a + b, 0);
      const moodV = tot ? day.reduce((a, r, i) => a + (r.sentiment as number) * (w[i] as number), 0) / tot : null;
      const att = mean(day.map((r) => r.attention));
      return {
        date: d,
        mood: moodV === null ? null : round1(moodV),
        p25: round1n(quantile(day.map((r) => r.sentiment), 0.25)),
        p75: round1n(quantile(day.map((r) => r.sentiment), 0.75)),
        attention: round1n(att),
        n: day.length,
      };
    });
  const mood = moodSeries.at(-1)?.mood ?? null;
  const moodPrev = moodSeries[0]?.mood ?? null;

  const withSent = rows.filter((r) => r.sentiment !== null);
  const scored = rows.filter((r) => r.score !== null);
  const recentAnoms = ds.anomalies.filter((a) => a.date >= start && (q.sector === "all" || ds.companyByTicker.get(a.ticker)?.sector === q.sector) && (q.source === "all" || a.sourceId === q.source || a.sourceId === "cross"));

  const sectors = Array.from(new Set(ds.companies.filter(sectorFilter).map((c) => c.sector))).sort();
  const today = ds.signals.get(asOf) ?? new Map();
  const weekAgo = ds.signals.get(addDays(asOf, -7)) ?? new Map();
  const heatmap = sectors.map((sector) => {
    const members = ds.companies.filter((c) => c.sector === sector).map((c) => today.get(c.ticker) as CompanySignal | undefined).filter((x): x is CompanySignal => !!x);
    const prior = ds.companies.filter((c) => c.sector === sector).map((c) => weekAgo.get(c.ticker) as CompanySignal | undefined).filter((x): x is CompanySignal => !!x);
    const srcSent = (s: SourceId, list: CompanySignal[]) => round1n(mean(list.map((m) => (m.perSource[s]?.available && m.perSource[s]?.sentiment !== null ? 100 * Math.tanh(2.5 * (m.perSource[s]?.sentiment as number)) : null))));
    const comp = round1n(mean(members.map((m) => m.sentimentScore)));
    const compPrior = round1n(mean(prior.map((m) => m.sentimentScore)));
    return {
      sector,
      companies: members.length,
      composite: comp,
      reddit: srcSent("reddit", members),
      hackernews: srcSent("hackernews", members),
      attention: round1n(mean(members.map((m) => m.attentionScore))),
      change7d: comp !== null && compPrior !== null ? round1(comp - compPrior) : null,
    };
  });

  const bins = Array.from({ length: 20 }, (_, i) => ({ from: i * 5, to: i * 5 + 5, count: 0 }));
  for (const r of scored) {
    const b = bins[Math.min(19, Math.floor((r.score as number) / 5))];
    if (b) b.count++;
  }

  const sortBy = <K extends keyof StockRow>(list: StockRow[], k: K, dir: "asc" | "desc", n = 6) =>
    [...list].filter((r) => r[k] !== null).sort((a, b) => ((a[k] as number) - (b[k] as number)) * (dir === "asc" ? 1 : -1)).slice(0, n);

  const liveish = ds.sources.filter((s) => s.state !== "unavailable");
  return {
    meta: ds.meta,
    query: q,
    allSectors: Array.from(new Set(ds.companies.map((c) => c.sector))).sort(),
    sources: ds.sources.map(({ descriptor: _d, ...rest }) => rest),
    kpis: {
      mood,
      moodChange: mood !== null && moodPrev !== null ? round1(mood - moodPrev) : null,
      breadth: withSent.length ? Math.round((100 * withSent.filter((r) => (r.sentiment as number) > 0).length) / withSent.length) : null,
      abnormalAttention: rows.filter((r) => (r.attention ?? 0) >= 90).length,
      anomalies: recentAnoms.length,
      avgConfidence: rows.length ? Math.round(mean(rows.map((r) => r.confidence)) as number) : null,
      sourcesActive: liveish.length,
      sourcesTotal: ds.sources.length,
      universe: rows.length,
    },
    moodSeries,
    heatmap,
    histogram: bins,
    scatter: rows.filter((r) => r.attention !== null && r.sentiment !== null).map((r) => ({ ticker: r.ticker, sector: r.sector, attention: r.attention as number, sentiment: r.sentiment as number, confidence: r.confidence, hypeRisk: r.hypeRisk })),
    bullish: q.source === "all" ? sortBy(rows, "score", "desc") : sortBy(rows, "sentiment", "desc"),
    bearish: q.source === "all" ? sortBy(rows, "score", "asc") : sortBy(rows, "sentiment", "asc"),
    rising: sortBy(rows, "attentionAcceleration", "desc"),
    unusual: sortBy(rows, "attention", "desc"),
    disagreements: sortBy(rows, "divergence", "desc"),
    anomalies: recentAnoms.slice(0, 14).map((a) => ({ ...a, name: ds.companyByTicker.get(a.ticker)?.name ?? a.ticker })),
    ranked: [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 12),
  };
}

/* ───────────────────────── explorer ───────────────────────── */

export async function getStocks(q: ViewQuery) {
  const ds = await getDataset();
  return { meta: ds.meta, query: q, sectors: Array.from(new Set(ds.companies.map((c) => c.sector))).sort(), rows: buildRows(ds, q) };
}

/* ───────────────────────── company detail ───────────────────────── */

export async function getStockDetail(tickerRaw: string, window = 90) {
  const ds = await getDataset();
  const ticker = tickerRaw.toUpperCase();
  const company = ds.companyByTicker.get(ticker) ?? ds.companies.find((c) => c.previousTickers.includes(ticker));
  if (!company) return null;
  const asOf = ds.meta.asOf;
  const start = addDays(asOf, -window + 1);
  const latest = ds.signals.get(asOf)?.get(company.ticker) ?? null;
  const history = ds.dates
    .filter((d) => d >= start)
    .map((d) => {
      const s = ds.signals.get(d)?.get(company.ticker);
      return {
        date: d,
        score: s?.altSignalScore ?? null,
        attention: s?.attentionScore ?? null,
        sentiment: s?.sentimentScore ?? null,
        confidence: s?.confidence ?? null,
        agreement: s?.agreement ?? null,
        divergence: s?.divergence ?? null,
        ...Object.fromEntries(SOURCE_IDS.map((src) => [`z_${src}`, s?.perSource[src]?.available ? round2n(s.perSource[src]?.z ?? null) : null])),
        ...Object.fromEntries(TEXT_SOURCES.map((src) => [`s_${src}`, s?.perSource[src]?.sentiment != null ? round1(100 * Math.tanh(2.5 * (s.perSource[src]?.sentiment as number))) : null])),
        wikiShock: s?.unusual.wikiShock ?? null,
        productDivergence: s?.unusual.productDivergence ?? null,
        devAcceleration: s?.unusual.devAcceleration ?? null,
      };
    });
  const metrics = await getDailyMetrics(company.ticker, start, asOf);
  const activity = new Map<string, Record<string, number | string | null>>();
  for (const m of metrics) {
    const row = activity.get(m.date) ?? { date: m.date };
    row[`${m.sourceId}_value`] = m.value;
    if (m.sourceId === "reddit" || m.sourceId === "hackernews") {
      row[`${m.sourceId}_engagement`] = m.engagementAdj;
      row[`${m.sourceId}_authors`] = m.uniqueAuthors;
    }
    activity.set(m.date, row);
  }
  const activitySeries = Array.from(activity.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Representative items: highest-relevance, most-engaged unique items of the last 14 days.
  const db = getDb();
  const repStart = addDays(asOf, -13);
  const mentionRows = await db
    .select({ m: t.companyMentions, d: t.sourceDocuments })
    .from(t.companyMentions)
    .innerJoin(t.sourceDocuments, eq(t.sourceDocuments.id, t.companyMentions.documentId))
    .where(and(eq(t.companyMentions.ticker, company.ticker), gte(t.companyMentions.date, repStart), lte(t.companyMentions.date, asOf), eq(t.sourceDocuments.dedupeStatus, "unique")))
    .orderBy(desc(t.sourceDocuments.engagementScore))
    .limit(60);
  const docIds = mentionRows.map((r) => r.d.id);
  const sentRows = docIds.length ? await db.select().from(t.sentimentResults).where(and(inArray(t.sentimentResults.documentId, docIds), eq(t.sentimentResults.ticker, company.ticker))) : [];
  const sentBy = new Map(sentRows.map((s) => [s.documentId, s]));
  const items = mentionRows
    .filter((r) => !ds.meta.runtimeDisabled.includes(r.d.sourceId as SourceId))
    .map((r) => {
      const s = sentBy.get(r.d.id);
      return {
        id: r.d.id,
        source: r.d.sourceId,
        community: r.d.community,
        title: r.d.title,
        body: r.d.bodyPreview,
        url: r.d.url,
        publishedAt: r.d.publishedAt,
        engagement: r.d.engagementScore,
        comments: r.d.engagementComments,
        isSynthetic: r.d.isSynthetic,
        matchReason: r.m.bestReason,
        matched: r.m.matchedTexts,
        relevance: r.m.relevance,
        sentiment: s ? { label: s.label, score: s.score, confidence: s.confidence, aspect: s.aspect, direction: s.direction, terms: s.matchedTerms } : null,
      };
    });
  // Narratives: aspect × label breakdown over the window's stored items (retention-limited).
  const narrativeRows = await db
    .select({ aspect: t.sentimentResults.aspect, label: t.sentimentResults.label, terms: t.sentimentResults.matchedTerms })
    .from(t.sentimentResults)
    .innerJoin(t.companyMentions, and(eq(t.companyMentions.documentId, t.sentimentResults.documentId), eq(t.companyMentions.ticker, t.sentimentResults.ticker)))
    .where(and(eq(t.sentimentResults.ticker, company.ticker), gte(t.companyMentions.date, addDays(asOf, -29))));
  const narratives = ["investment", "product", "reputation", "general"].map((aspect) => {
    const list = narrativeRows.filter((n) => n.aspect === aspect);
    const termCount = new Map<string, number>();
    for (const n of list) for (const term of n.terms.split(",").filter(Boolean)) termCount.set(term, (termCount.get(term) ?? 0) + 1);
    return {
      aspect,
      items: list.length,
      positive: list.filter((n) => n.label === "positive").length,
      negative: list.filter((n) => n.label === "negative").length,
      neutral: list.filter((n) => n.label === "neutral" || n.label === "uncertain").length,
      sarcastic: list.filter((n) => n.label === "sarcastic").length,
      topTerms: Array.from(termCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([term, n]) => ({ term, n })),
    };
  });

  const anomalies = ds.anomalies.filter((a) => a.ticker === company.ticker).slice(0, 30);
  const sources = ds.sources.map((src) => {
    const ps = latest?.perSource[src.id];
    return {
      id: src.id,
      name: src.name,
      state: src.state,
      stateReason: src.stateReason,
      expected: latest?.sourcesExpected.includes(src.id) ?? false,
      available: !!ps?.available,
      z: ps?.z ?? null,
      accel: ps?.accel ?? null,
      sentiment: ps?.sentiment === null || ps?.sentiment === undefined ? null : round1(100 * Math.tanh(2.5 * ps.sentiment)),
      mentions7: ps?.mentions7 ?? null,
      freshnessDays: ps?.freshnessDays ?? null,
    };
  });

  // Historical score vs subsequent (5-day) return — retrospective context only.
  let scoreVsReturn: { date: string; score: number; ret: number }[] = [];
  if (ds.meta.pricesAvailable) {
    const fr = await db.select().from(t.forwardReturns).where(and(eq(t.forwardReturns.ticker, company.ticker), eq(t.forwardReturns.horizon, 5)));
    const byDate = new Map(fr.map((r) => [r.signalDate, r.ret]));
    scoreVsReturn = ds.dates
      .map((d) => ({ date: d, score: ds.signals.get(d)?.get(company.ticker)?.altSignalScore ?? null, ret: byDate.get(d) ?? null }))
      .filter((x): x is { date: string; score: number; ret: number } => x.score !== null && x.ret !== null)
      .map((x) => ({ ...x, ret: Math.round(x.ret * 10_000) / 100 }));
  }

  return { meta: ds.meta, company, latest, history, activity: activitySeries, items, narratives, anomalies, sources, scoreVsReturn, window };
}

/* ───────────────────────── data status ───────────────────────── */

export async function getDataStatus() {
  const ds = await getDataset();
  const db = getDb();
  const runs = await db.select().from(t.ingestionRuns).orderBy(desc(t.ingestionRuns.id)).limit(20);
  const quality = await db.select().from(t.dataQualityEvents).orderBy(desc(t.dataQualityEvents.id)).limit(40);
  const models = await db.select().from(t.modelVersions);
  const universe = await db.select().from(t.universeSnapshots).orderBy(desc(t.universeSnapshots.id)).limit(5);
  return {
    meta: ds.meta,
    sources: ds.sources,
    runs: runs.map((r) => ({ ...r, errors: JSON.parse(r.errorsJson) as string[] })),
    quality,
    models,
    universe,
    counts: { companies: ds.companies.length, dates: ds.dates.length, firstDate: ds.dates[0] ?? null, lastDate: ds.dates.at(-1) ?? null },
  };
}

export async function getSectors() {
  const ds = await getDataset();
  const rows = buildRows(ds, ViewQuerySchema.parse({}));
  return Array.from(new Set(ds.companies.map((c) => c.sector)))
    .sort()
    .map((sector) => {
      const m = rows.filter((r) => r.sector === sector);
      return { sector, companies: m.length, avgScore: round1n(mean(m.map((r) => r.score))), avgSentiment: round1n(mean(m.map((r) => r.sentiment))), avgAttention: round1n(mean(m.map((r) => r.attention))) };
    });
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round1n = (x: number | null) => (x === null ? null : round1(x));
const round2n = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);
