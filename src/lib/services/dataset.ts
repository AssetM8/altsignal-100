import "server-only";
import { desc, eq, and, gte, lte } from "drizzle-orm";
import { SOURCE_IDS, type SourceId } from "@/config/signal";
import { getEnv } from "@/config/env";
import { getDb, type DB } from "../db/client";
import * as t from "../db/schema";
import { computeSignalsForDate, type CompanySignal } from "../signals/composite";
import type { SourceFeatures } from "../signals/features";
import type { ProviderDescriptor, ProviderState } from "../providers/types";

/**
 * In-memory, read-only snapshot of the analytics database. Built once per
 * ingestion (keyed on lastRefreshAt) so page requests never recompute
 * historical signals. Raw documents are NOT loaded here; they are queried on
 * demand for the audit trail.
 */

export interface CompanyInfo {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  rank: number;
  marketCapUsd: number;
  previousTickers: string[];
}

export interface SourceInfo {
  id: SourceId;
  name: string;
  kind: "text" | "numeric";
  implementation: "live" | "fixture";
  state: ProviderState;
  stateReason: string | null;
  lastSuccessAt: string | null;
  latestDataDate: string | null;
  descriptor: ProviderDescriptor;
  coverage: number;
}

export interface DatasetMeta {
  mode: "demo" | "live";
  asOf: string;
  isSynthetic: boolean;
  lastRefreshAt: string;
  universeAsOf: string;
  universeProvider: string;
  universeIsLive: boolean;
  compositeModel: string;
  classifierModel: string;
  pricesAvailable: boolean;
  pricesSynthetic: boolean;
  runtimeDisabled: SourceId[];
}

export interface AnomalyRow {
  ticker: string;
  date: string;
  sourceId: string;
  kind: string;
  z: number;
  description: string;
}

export interface Dataset {
  meta: DatasetMeta;
  companies: CompanyInfo[];
  companyByTicker: Map<string, CompanyInfo>;
  sources: SourceInfo[];
  dates: string[];
  /** date → ticker → signal */
  signals: Map<string, Map<string, CompanySignal>>;
  anomalies: AnomalyRow[];
  expectedSources: Map<string, SourceId[]>;
}

let cache: { key: string; ds: Dataset } | null = null;
let componentCache: { key: string; byDate: Map<string, Map<string, Partial<Record<SourceId, SourceFeatures>>>> } | null = null;

export class DatasetNotReadyError extends Error {
  constructor() {
    super("The database has not been seeded. Run `npm run setup` (migrations + demo seed).");
  }
}

async function readMeta(db: DB): Promise<Record<string, string>> {
  try {
    const rows = await db.select().from(t.datasetMeta);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    throw new DatasetNotReadyError();
  }
}

export async function getDataset(): Promise<Dataset> {
  const db = getDb();
  const m = await readMeta(db);
  if (!m.asOf) throw new DatasetNotReadyError();
  const disabled = getEnv().ALTSIGNAL_DISABLED_PROVIDERS.filter((s): s is SourceId => (SOURCE_IDS as readonly string[]).includes(s));
  const key = `${m.lastRefreshAt}|${disabled.join(",")}`;
  if (cache?.key === key) return cache.ds;

  const companiesRows = await db
    .select({ c: t.companies, m: t.universeMembers })
    .from(t.universeMembers)
    .innerJoin(t.companies, eq(t.companies.id, t.universeMembers.companyId))
    .innerJoin(t.universeSnapshots, eq(t.universeSnapshots.id, t.universeMembers.snapshotId))
    .where(eq(t.universeSnapshots.asOf, m.universeAsOf as string));
  const secRows = await db.select().from(t.securities);
  const prevBy = new Map<number, string[]>();
  for (const s of secRows) if (s.validTo) prevBy.set(s.companyId, [...(prevBy.get(s.companyId) ?? []), s.ticker]);
  const companies: CompanyInfo[] = companiesRows
    .map(({ c, m: mm }) => ({ ticker: c.ticker, name: c.name, exchange: c.exchange, sector: c.sector, industry: c.industry, rank: mm.rank, marketCapUsd: mm.marketCapUsd, previousTickers: (prevBy.get(c.id) ?? []).filter((x) => x !== c.ticker) }))
    .sort((a, b) => a.rank - b.rank);

  const sigRows = await db.select().from(t.dailyCompanySignals);
  const signals = new Map<string, Map<string, CompanySignal>>();
  const expectedSources = new Map<string, SourceId[]>();
  for (const r of sigRows) {
    const detail = JSON.parse(r.detailJson) as Omit<CompanySignal, "ticker" | "date" | "altSignalScore" | "rawScore" | "attentionScore" | "sentimentScore" | "attentionAcceleration" | "sentimentChange" | "agreement" | "divergence" | "confidence" | "anomalyScore" | "hypeRisk">;
    const s: CompanySignal = {
      ticker: r.ticker,
      date: r.date,
      altSignalScore: r.altSignalScore,
      rawScore: r.rawScore,
      attentionScore: r.attentionScore,
      sentimentScore: r.sentimentScore,
      attentionAcceleration: r.attentionAcceleration,
      sentimentChange: r.sentimentChange,
      agreement: r.agreement,
      divergence: r.divergence,
      confidence: r.confidence,
      anomalyScore: r.anomalyScore,
      hypeRisk: r.hypeRisk as CompanySignal["hypeRisk"],
      ...detail,
    };
    let byT = signals.get(r.date);
    if (!byT) { byT = new Map(); signals.set(r.date, byT); }
    byT.set(r.ticker, s);
    if (r.date === m.asOf) expectedSources.set(r.ticker, s.sourcesExpected);
  }
  const dates = Array.from(signals.keys()).sort();

  // Runtime-disabled providers: recompute composites without them from stored components.
  if (disabled.length) {
    const comps = await getComponents();
    for (const d of dates) {
      const fm = comps.get(d) ?? new Map();
      const recomputed = computeSignalsForDate(d, fm, { expectedSources, excludeSources: disabled });
      signals.set(d, new Map(recomputed.map((s) => [s.ticker, s])));
    }
  }

  const srcRows = await db.select().from(t.dataSources);
  const coverageByDate = signals.get(m.asOf as string);
  const sources: SourceInfo[] = SOURCE_IDS.map((id) => {
    const r = srcRows.find((x) => x.id === id);
    const descriptor = r ? (JSON.parse(r.descriptorJson) as ProviderDescriptor) : ({ id, name: id } as ProviderDescriptor);
    const runtimeOff = disabled.includes(id);
    const covered = coverageByDate ? Array.from(coverageByDate.values()).filter((s) => s.sourcesAvailable.includes(id)).length : 0;
    return {
      id,
      name: r?.name ?? id,
      kind: (r?.kind ?? "numeric") as "text" | "numeric",
      implementation: (r?.implementation ?? "fixture") as "live" | "fixture",
      state: runtimeOff ? "unavailable" : ((r?.state ?? "unavailable") as ProviderState),
      stateReason: runtimeOff ? "Disabled at runtime by ALTSIGNAL_DISABLED_PROVIDERS" : (r?.stateReason ?? "Never ingested"),
      lastSuccessAt: r?.lastSuccessAt ?? null,
      latestDataDate: r?.latestDataDate ?? null,
      descriptor,
      coverage: runtimeOff ? 0 : covered,
    };
  });

  const anomalies = (await db.select().from(t.anomalyEvents).orderBy(desc(t.anomalyEvents.date)))
    .filter((a) => !disabled.includes(a.sourceId as SourceId));

  const ds: Dataset = {
    meta: {
      mode: (m.mode as "demo" | "live") ?? "demo",
      asOf: m.asOf as string,
      isSynthetic: m.isSynthetic === "true",
      lastRefreshAt: m.lastRefreshAt as string,
      universeAsOf: m.universeAsOf as string,
      universeProvider: m.universeProvider as string,
      universeIsLive: m.universeIsLive === "true",
      compositeModel: m.compositeModel as string,
      classifierModel: m.classifierModel as string,
      pricesAvailable: m.pricesAvailable === "true",
      pricesSynthetic: m.pricesSynthetic === "true",
      runtimeDisabled: disabled,
    },
    companies,
    companyByTicker: new Map(companies.map((c) => [c.ticker, c])),
    sources,
    dates,
    signals,
    anomalies,
    expectedSources,
  };
  cache = { key, ds };
  return ds;
}

/** Per-source point-in-time features for every date (used by the Lab and for runtime source removal). */
export async function getComponents(): Promise<Map<string, Map<string, Partial<Record<SourceId, SourceFeatures>>>>> {
  const db = getDb();
  const m = await readMeta(db);
  const key = m.lastRefreshAt ?? "";
  if (componentCache?.key === key) return componentCache.byDate;
  const rows = await db.select().from(t.signalComponents);
  const byDate = new Map<string, Map<string, Partial<Record<SourceId, SourceFeatures>>>>();
  for (const r of rows) {
    let m2 = byDate.get(r.date);
    if (!m2) { m2 = new Map(); byDate.set(r.date, m2); }
    const cur = m2.get(r.ticker) ?? {};
    cur[r.sourceId as SourceId] = JSON.parse(r.featuresJson) as SourceFeatures;
    m2.set(r.ticker, cur);
  }
  componentCache = { key, byDate };
  return byDate;
}

export async function getDailyMetrics(ticker: string, start: string, end: string) {
  return getDb()
    .select()
    .from(t.dailySourceMetrics)
    .where(and(eq(t.dailySourceMetrics.ticker, ticker), gte(t.dailySourceMetrics.date, start), lte(t.dailySourceMetrics.date, end)));
}

export function invalidateDataset(): void {
  cache = null;
  componentCache = null;
}
