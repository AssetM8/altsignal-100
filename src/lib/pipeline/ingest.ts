import { and, eq, gte, lte, sql } from "drizzle-orm";
import { ANOMALY, DOCUMENT_RETENTION_DAYS, HISTORY_DAYS, SOURCE_IDS, type SourceId } from "@/config/signal";
import { getEnv, type ServerEnv } from "@/config/env";
import type { DB } from "../db/client";
import * as t from "../db/schema";
import { FileUniverseProvider, buildEntities } from "../providers/universe";
import { createProviders } from "../providers/registry";
import type { ProviderBatch, UniverseProvider, UniverseSnapshot } from "../providers/types";
import { DEMO_AS_OF } from "../providers/fixtures/world";
import { EntityResolver } from "../nlp/entity-resolver";
import { defaultClassifier, type TextClassifier } from "../nlp/sentiment";
import { preview } from "../nlp/clean";
import { aggregateTextMetrics, processDocumentsChunked, MIN_RELEVANCE } from "./process-text";
import { computeSourceFeatures, type DailyMetricRow, type SourceFeatures } from "../signals/features";
import { computeSignalsForDate, detectAnomalies, type CompanySignal } from "../signals/composite";
import { computeForwardReturns } from "../backtest/labels";
import { addDays, dateRange } from "../util/dates";

export const COMPOSITE_MODEL = { name: "altsignal-composite", version: "1.0.0" } as const;

export interface IngestOptions {
  db: DB;
  env?: ServerEnv;
  /** Inclusive range to (re)fetch. Defaults: full history (seed) ending at the as-of date. */
  start?: string;
  end?: string;
  universeProvider?: UniverseProvider;
  classifier?: TextClassifier;
  log?: (msg: string) => void;
  /** Full rebuild: clear run logs and quality events from previous seeds first. */
  reset?: boolean;
}

export interface IngestSummary {
  asOf: string;
  mode: string;
  sources: Record<string, { state: string; documents: number; kept: number; mentions: number; observations: number; errors: number }>;
  signals: number;
  anomalies: number;
  prices: number;
  forwardReturns: number;
  durationMs: number;
}

const now = () => new Date().toISOString();

async function insertChunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function upsertUniverse(db: DB, snap: UniverseSnapshot): Promise<Map<string, number>> {
  const ts = now();
  const ids = new Map<string, number>();
  for (const c of snap.companies) {
    const [row] = await db
      .insert(t.companies)
      .values({ ticker: c.ticker, name: c.name, exchange: c.exchange, sector: c.sector, industry: c.industry, createdAt: ts })
      .onConflictDoUpdate({ target: t.companies.ticker, set: { name: c.name, exchange: c.exchange, sector: c.sector, industry: c.industry } })
      .returning({ id: t.companies.id });
    ids.set(c.ticker, (row as { id: number }).id);
  }
  // Securities: current identifier + previous identifiers (ticker changes / renames).
  await db.delete(t.securities);
  await insertChunked(snap.companies, 100, (chunk) =>
    db.insert(t.securities).values(
      chunk.flatMap((c) => [
        { companyId: ids.get(c.ticker) as number, ticker: c.ticker, nameAtTime: c.name, shareClass: c.shareClass, securityType: c.securityType, validFrom: c.previousIdentifiers.at(-1)?.until ?? null, validTo: null },
        ...c.previousIdentifiers.map((p) => ({ companyId: ids.get(c.ticker) as number, ticker: p.ticker, nameAtTime: p.name ?? null, shareClass: c.shareClass, securityType: c.securityType, validFrom: null, validTo: p.until })),
      ]),
    ),
  );
  const existing = await db.select().from(t.universeSnapshots).where(and(eq(t.universeSnapshots.asOf, snap.asOf), eq(t.universeSnapshots.provider, snap.provider)));
  let snapshotId = existing[0]?.id;
  if (!snapshotId) {
    const [s] = await db
      .insert(t.universeSnapshots)
      .values({ asOf: snap.asOf, provider: snap.provider, isLive: snap.isLive, description: snap.description, selectionRules: snap.selectionRules, createdAt: ts })
      .returning({ id: t.universeSnapshots.id });
    snapshotId = (s as { id: number }).id;
  }
  await db.delete(t.universeMembers).where(eq(t.universeMembers.snapshotId, snapshotId));
  await db.insert(t.universeMembers).values(
    snap.companies.map((c) => ({ snapshotId: snapshotId as number, companyId: ids.get(c.ticker) as number, ticker: c.ticker, rank: c.rank, marketCapUsd: c.marketCapUsd, sourceTimestamp: snap.asOf })),
  );
  return ids;
}

async function upsertModelVersion(db: DB, kind: string, name: string, version: string, description: string, params: unknown): Promise<number> {
  const [row] = await db
    .insert(t.modelVersions)
    .values({ kind, name, version, description, paramsJson: JSON.stringify(params), createdAt: now() })
    .onConflictDoUpdate({ target: [t.modelVersions.kind, t.modelVersions.name, t.modelVersions.version], set: { description } })
    .returning({ id: t.modelVersions.id });
  return (row as { id: number }).id;
}

/**
 * Full ingestion + signal computation. Idempotent: re-running for a range
 * replaces that range's metrics, then recomputes point-in-time features over
 * the stored history.
 */
export async function runIngestion(opts: IngestOptions): Promise<IngestSummary> {
  const t0 = Date.now();
  const env = opts.env ?? getEnv();
  const log = opts.log ?? (() => {});
  const db = opts.db;
  const classifier = opts.classifier ?? defaultClassifier;

  if (opts.reset) {
    await db.delete(t.dataQualityEvents);
    await db.delete(t.ingestionRuns);
  }
  const snap = await (opts.universeProvider ?? new FileUniverseProvider()).load();
  await upsertUniverse(db, snap);
  const entities = buildEntities(snap);
  const tickers = entities.map((e) => e.ticker);
  const caps = new Map(snap.companies.map((c) => [c.ticker, c.marketCapUsd]));
  const providers = createProviders(entities, caps, env);

  const asOf = env.ALTSIGNAL_MODE === "demo" ? DEMO_AS_OF : addDays(new Date().toISOString().slice(0, 10), -1);
  const end = opts.end ?? asOf;
  const start = opts.start ?? addDays(end, -(HISTORY_DAYS - 1));
  log(`universe ${snap.provider} as of ${snap.asOf} (${tickers.length} companies); mode=${env.ALTSIGNAL_MODE}; range ${start}..${end}`);

  const classifierId = await upsertModelVersion(db, "classifier", classifier.info.name, classifier.info.version, classifier.info.description, {});
  await upsertModelVersion(db, "composite", COMPOSITE_MODEL.name, COMPOSITE_MODEL.version, "Transparent weighted composite (see METHODOLOGY.md)", {});

  const resolver = new EntityResolver(entities);
  const summary: IngestSummary = { asOf, mode: env.ALTSIGNAL_MODE, sources: {}, signals: 0, anomalies: 0, prices: 0, forwardReturns: 0, durationMs: 0 };
  const retentionStart = addDays(end, -(DOCUMENT_RETENTION_DAYS - 1));

  for (const id of SOURCE_IDS) {
    const p = providers.alt[id];
    const st = p.status();
    const descriptorJson = JSON.stringify(p.descriptor);
    const stat = { state: st.state as string, documents: 0, kept: 0, mentions: 0, observations: 0, errors: 0 };
    summary.sources[id] = stat;
    await db
      .insert(t.dataSources)
      .values({ id, name: p.descriptor.name, kind: p.descriptor.kind, implementation: p.descriptor.implementation, state: st.state, stateReason: st.reason, lastAttemptAt: now(), descriptorJson })
      .onConflictDoUpdate({ target: t.dataSources.id, set: { name: p.descriptor.name, kind: p.descriptor.kind, implementation: p.descriptor.implementation, state: st.state, stateReason: st.reason, lastAttemptAt: now(), descriptorJson } });
    if (st.state === "unavailable") {
      log(`- ${id}: unavailable (${st.reason})`);
      await db.insert(t.dataQualityEvents).values({ createdAt: now(), sourceId: id, severity: "warning", kind: "provider_unavailable", message: st.reason ?? "unavailable" });
      continue;
    }

    const [run] = await db
      .insert(t.ingestionRuns)
      .values({ startedAt: now(), mode: env.ALTSIGNAL_MODE, sourceId: id, status: "running", rangeStart: start, rangeEnd: end })
      .returning({ id: t.ingestionRuns.id });
    const runId = (run as { id: number }).id;
    let batch: ProviderBatch;
    try {
      batch = await p.fetch({ companies: entities, start, end });
    } catch (e) {
      const msg = (e as Error).message;
      await db.update(t.ingestionRuns).set({ status: "failed", finishedAt: now(), errorsJson: JSON.stringify([msg]) }).where(eq(t.ingestionRuns.id, runId));
      await db.update(t.dataSources).set({ state: "unavailable", stateReason: `Fetch failed: ${msg}` }).where(eq(t.dataSources.id, id));
      stat.state = "unavailable";
      stat.errors = 1;
      log(`- ${id}: fetch failed: ${msg}`);
      continue;
    }
    stat.errors = batch.quality.errors.length;

    const covered = batch.coveredDates ?? Array.from(new Set([...batch.documents.map((d) => d.publishedAt.slice(0, 10)), ...batch.observations.map((o) => o.date)])).sort();
    const isSynthetic = batch.documents.some((d) => d.isSynthetic) || batch.observations.some((o) => o.isSynthetic);
    let metrics: Map<string, DailyMetricRow[]>;

    if (p.descriptor.kind === "text") {
      stat.documents = batch.documents.length;
      const processed = await processDocumentsChunked(batch.documents, resolver, classifier);
      metrics = aggregateTextMetrics(processed, tickers, covered);
      // Persist an audit trail for recent documents only (retention policy).
      const keep = processed.filter((pd) => pd.date >= retentionStart && pd.mentions.some((m) => m.relevance >= MIN_RELEVANCE));
      stat.kept = keep.length;
      await db.delete(t.sentimentResults).where(sql`document_id in (select id from source_documents where source_id = ${id} and published_date between ${start} and ${end})`);
      await db.delete(t.companyMentions).where(and(eq(t.companyMentions.sourceId, id), gte(t.companyMentions.date, start), lte(t.companyMentions.date, end)));
      await db.delete(t.sourceDocuments).where(and(eq(t.sourceDocuments.sourceId, id), gte(t.sourceDocuments.publishedDate, start), lte(t.sourceDocuments.publishedDate, end)));
      await insertChunked(keep, 200, async (chunk) => {
        const ids = await db
          .insert(t.sourceDocuments)
          .values(
            chunk.map((pd) => ({
              sourceId: id,
              externalId: pd.doc.externalId,
              url: pd.doc.url,
              community: pd.doc.community,
              authorHash: pd.doc.authorHash,
              title: preview(pd.title, 300),
              bodyPreview: preview(pd.body, 500),
              publishedAt: pd.doc.publishedAt,
              publishedDate: pd.date,
              collectedAt: pd.doc.collectedAt,
              engagementScore: pd.doc.engagement.score,
              engagementComments: pd.doc.engagement.comments,
              lang: pd.lang,
              dedupeStatus: pd.dedupe.status,
              duplicateOf: pd.dedupe.duplicateOf,
              isSynthetic: pd.doc.isSynthetic,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: t.sourceDocuments.id, externalId: t.sourceDocuments.externalId });
        const idByExt = new Map(ids.map((r) => [r.externalId, r.id]));
        const mentionRows = [];
        const sentRows = [];
        for (const pd of chunk) {
          const docId = idByExt.get(pd.doc.externalId);
          if (!docId) continue;
          for (const m of pd.mentions) {
            mentionRows.push({ documentId: docId, ticker: m.ticker, sourceId: id, date: pd.date, bestReason: m.bestReason, reasons: m.reasons.join(","), matchedTexts: m.matchedTexts.join(" | "), relevance: m.relevance, ambiguous: m.ambiguous });
            if (m.sentiment) {
              sentRows.push({ documentId: docId, ticker: m.ticker, modelVersionId: classifierId, label: m.sentiment.label, score: m.sentiment.score, confidence: m.sentiment.confidence, aspect: m.sentiment.aspect, direction: m.sentiment.direction, matchedTerms: m.sentiment.matchedTerms.join(","), sarcasm: m.sentiment.flags.sarcasm, uncertain: m.sentiment.flags.uncertain, processedAt: now() });
            }
          }
        }
        stat.mentions += mentionRows.length;
        if (mentionRows.length) await db.insert(t.companyMentions).values(mentionRows);
        if (sentRows.length) await db.insert(t.sentimentResults).values(sentRows);
      });
      if (stat.mentions === 0) stat.mentions = processed.reduce((a, pd) => a + pd.mentions.length, 0);
    } else {
      stat.observations = batch.observations.length;
      metrics = new Map();
      for (const o of batch.observations) {
        const arr = metrics.get(o.ticker) ?? [];
        arr.push({ date: o.date, value: o.value });
        metrics.set(o.ticker, arr);
      }
    }

    // Replace the metrics for the fetched range.
    await db.delete(t.dailySourceMetrics).where(and(eq(t.dailySourceMetrics.sourceId, id), gte(t.dailySourceMetrics.date, start), lte(t.dailySourceMetrics.date, end)));
    const rows = Array.from(metrics.entries()).flatMap(([ticker, list]) =>
      list.map((r) => ({ ticker, sourceId: id, ...r, isSynthetic, collectedAt: batch.fetchedAt })),
    );
    await insertChunked(rows, 400, (chunk) => db.insert(t.dailySourceMetrics).values(chunk));

    // Coverage gaps become explicit data-quality events (never silently zero-filled).
    const coveredSet = new Set(covered);
    const gaps = dateRange(start, end).filter((d) => !coveredSet.has(d));
    if (gaps.length) {
      await db.insert(t.dataQualityEvents).values({ createdAt: now(), sourceId: id, severity: gaps.length > 3 ? "warning" : "info", kind: "coverage_gap", message: `${gaps.length} day(s) not collected in ${start}..${end} (e.g. ${gaps.slice(0, 3).join(", ")})`, date: gaps[0] });
    }
    for (const err of batch.quality.errors.slice(0, 20)) {
      await db.insert(t.dataQualityEvents).values({ createdAt: now(), sourceId: id, severity: "warning", kind: "fetch_error", message: err });
    }
    const latest = covered.at(-1) ?? null;
    let state = st.state;
    let reason = st.reason;
    if (latest && latest < addDays(end, -2)) {
      state = "stale";
      reason = `Latest data ${latest} is older than 2 days before ${end}`;
      await db.insert(t.dataQualityEvents).values({ createdAt: now(), sourceId: id, severity: "warning", kind: "stale", message: reason, date: latest });
    }
    await db.update(t.dataSources).set({ state, stateReason: reason, lastSuccessAt: now(), latestDataDate: latest }).where(eq(t.dataSources.id, id));
    stat.state = state;
    await db
      .update(t.ingestionRuns)
      .set({ status: "succeeded", finishedAt: now(), documentsIn: stat.documents, documentsKept: stat.kept, mentions: stat.mentions, observations: stat.observations, errorsJson: JSON.stringify(batch.quality.errors.slice(0, 50)) })
      .where(eq(t.ingestionRuns.id, runId));
    log(`- ${id}: ${state} docs=${stat.documents} kept=${stat.kept} mentions=${stat.mentions} obs=${stat.observations} errors=${stat.errors}`);
  }

  // ── Features and composite over the full stored history ──
  const signalRange = await recomputeSignals(db, tickers, end, log);
  summary.signals = signalRange.signals;
  summary.anomalies = signalRange.anomalies;

  // ── Outcome labels (prices) — used only for retrospective validation ──
  if (providers.market) {
    const histStart = addDays(end, -(HISTORY_DAYS - 1));
    const bars = await providers.market.getDailyCloses(tickers, histStart, end);
    await db.delete(t.marketPrices);
    await insertChunked(bars, 500, (chunk) => db.insert(t.marketPrices).values(chunk.map((b) => ({ ...b, provider: providers.market?.id ?? "unknown" }))));
    const fr = computeForwardReturns(bars, dateRange(histStart, end));
    await db.delete(t.forwardReturns);
    await insertChunked(fr, 500, (chunk) => db.insert(t.forwardReturns).values(chunk));
    summary.prices = bars.length;
    summary.forwardReturns = fr.length;
    log(`prices=${bars.length} forwardReturns=${fr.length} (${providers.market.isLive ? "live" : "SYNTHETIC"})`);
  } else {
    log("no market data provider configured: Signal Lab will report missing outcome labels");
  }

  const meta: Record<string, string> = {
    mode: env.ALTSIGNAL_MODE,
    asOf: end,
    isSynthetic: String(env.ALTSIGNAL_MODE === "demo"),
    lastRefreshAt: now(),
    universeAsOf: snap.asOf,
    universeProvider: snap.provider,
    universeIsLive: String(snap.isLive),
    compositeModel: `${COMPOSITE_MODEL.name}@${COMPOSITE_MODEL.version}`,
    classifierModel: `${classifier.info.name}@${classifier.info.version}`,
    pricesSynthetic: String(!!providers.market && !providers.market.isLive),
    pricesAvailable: String(!!providers.market),
  };
  for (const [key, value] of Object.entries(meta)) {
    await db.insert(t.datasetMeta).values({ key, value }).onConflictDoUpdate({ target: t.datasetMeta.key, set: { value } });
  }
  summary.durationMs = Date.now() - t0;
  return summary;
}

/** Load stored daily metrics and recompute point-in-time features + composite for every date. */
export async function recomputeSignals(db: DB, tickers: string[], end: string, log: (m: string) => void = () => {}): Promise<{ signals: number; anomalies: number }> {
  const start = addDays(end, -(HISTORY_DAYS - 1));
  const dates = dateRange(start, end);
  const metricRows = await db.select().from(t.dailySourceMetrics).where(and(gte(t.dailySourceMetrics.date, addDays(start, -60)), lte(t.dailySourceMetrics.date, end)));
  const sourcesDisabled = new Set(
    (await db.select().from(t.dataSources).where(eq(t.dataSources.state, "unavailable"))).map((r) => r.id as SourceId),
  );
  const series = new Map<string, DailyMetricRow[]>();
  for (const r of metricRows) {
    if (sourcesDisabled.has(r.sourceId as SourceId)) continue;
    const k = `${r.ticker}|${r.sourceId}`;
    const arr = series.get(k) ?? [];
    arr.push(r as DailyMetricRow);
    series.set(k, arr);
  }

  const featuresByDate = new Map<string, Map<string, Partial<Record<SourceId, SourceFeatures>>>>();
  const expected = new Map<string, SourceId[]>();
  const componentRows: { ticker: string; sourceId: string; date: string; featuresJson: string }[] = [];
  for (const ticker of tickers) {
    await new Promise((r) => setImmediate(r));
    const exp: SourceId[] = [];
    for (const s of SOURCE_IDS) {
      const rows = series.get(`${ticker}|${s}`);
      if (!rows?.length) continue;
      // A text source is "expected" for a company only if it has ever mentioned it.
      if ((s === "reddit" || s === "hackernews") && !rows.some((r) => (r.mentionCount ?? 0) > 0)) continue;
      exp.push(s);
      for (const f of computeSourceFeatures(s, rows, dates)) {
        let m = featuresByDate.get(f.date);
        if (!m) { m = new Map(); featuresByDate.set(f.date, m); }
        const cur = m.get(ticker) ?? {};
        cur[s] = f;
        m.set(ticker, cur);
        componentRows.push({ ticker, sourceId: s, date: f.date, featuresJson: JSON.stringify(f) });
      }
    }
    expected.set(ticker, exp);
  }
  await db.delete(t.signalComponents);
  await insertChunked(componentRows, 500, (chunk) => db.insert(t.signalComponents).values(chunk));

  const signalRows: (typeof t.dailyCompanySignals.$inferInsert)[] = [];
  const anomalyRows: (typeof t.anomalyEvents.$inferInsert)[] = [];
  let prev = new Map<string, CompanySignal>();
  const lastEvent = new Map<string, string>();
  for (const d of dates) {
    await new Promise((r) => setImmediate(r));
    const fm = featuresByDate.get(d) ?? new Map();
    for (const tk of tickers) if (!fm.has(tk)) fm.set(tk, {});
    const sigs = computeSignalsForDate(d, fm, { expectedSources: expected });
    const next = new Map<string, CompanySignal>();
    for (const s of sigs) {
      next.set(s.ticker, s);
      signalRows.push({
        ticker: s.ticker,
        date: s.date,
        altSignalScore: s.altSignalScore,
        rawScore: s.rawScore,
        attentionScore: s.attentionScore,
        sentimentScore: s.sentimentScore,
        attentionAcceleration: s.attentionAcceleration,
        sentimentChange: s.sentimentChange,
        agreement: s.agreement,
        divergence: s.divergence,
        confidence: s.confidence,
        anomalyScore: s.anomalyScore,
        hypeRisk: s.hypeRisk,
        detailJson: JSON.stringify({ components: s.components, contributions: s.contributions, penalties: s.penalties, confidenceFactors: s.confidenceFactors, sourcesAvailable: s.sourcesAvailable, sourcesExpected: s.sourcesExpected, unusual: s.unusual, blended: s.blended, perSource: s.perSource }),
        modelVersion: `${COMPOSITE_MODEL.name}@${COMPOSITE_MODEL.version}`,
      });
      for (const a of detectAnomalies(s, prev.get(s.ticker))) {
        const k = `${a.ticker}|${a.sourceId}|${a.kind}`;
        const last = lastEvent.get(k);
        if (last && addDays(last, ANOMALY.refractoryDays) > a.date) continue;
        lastEvent.set(k, a.date);
        anomalyRows.push(a);
      }
    }
    prev = next;
  }
  await db.delete(t.dailyCompanySignals);
  await insertChunked(signalRows, 400, (chunk) => db.insert(t.dailyCompanySignals).values(chunk));
  await db.delete(t.anomalyEvents);
  await insertChunked(anomalyRows, 400, (chunk) => db.insert(t.anomalyEvents).values(chunk));
  log(`signals=${signalRows.length} components=${componentRows.length} anomalies=${anomalyRows.length}`);
  return { signals: signalRows.length, anomalies: anomalyRows.length };
}

