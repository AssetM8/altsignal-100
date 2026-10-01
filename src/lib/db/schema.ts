import { sqliteTable, text, integer, real, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Relational schema (SQLite via libSQL for local/dev; see docs/ARCHITECTURE.md
 * for the PostgreSQL mapping). Dates are UTC "YYYY-MM-DD" strings and
 * timestamps are ISO-8601 UTC strings, so ordering is lexicographic.
 * No personal data is stored: authors are salted hashes, bodies are previews.
 */

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  name: text("name").notNull(),
  exchange: text("exchange").notNull(),
  sector: text("sector").notNull(),
  industry: text("industry").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("companies_ticker_uq").on(t.ticker)]);

/** Security identifiers over time — handles ticker changes and renames. */
export const securities = sqliteTable("securities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  ticker: text("ticker").notNull(),
  nameAtTime: text("name_at_time"),
  shareClass: text("share_class"),
  securityType: text("security_type").notNull(),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
}, (t) => [index("securities_ticker_idx").on(t.ticker), index("securities_company_idx").on(t.companyId)]);

export const universeSnapshots = sqliteTable("universe_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  asOf: text("as_of").notNull(),
  provider: text("provider").notNull(),
  isLive: integer("is_live", { mode: "boolean" }).notNull(),
  description: text("description").notNull(),
  selectionRules: text("selection_rules").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [index("universe_snapshots_asof_idx").on(t.asOf)]);

export const universeMembers = sqliteTable("universe_members", {
  snapshotId: integer("snapshot_id").notNull().references(() => universeSnapshots.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
  ticker: text("ticker").notNull(),
  rank: integer("rank").notNull(),
  marketCapUsd: real("market_cap_usd").notNull(),
  sourceTimestamp: text("source_timestamp").notNull(),
}, (t) => [primaryKey({ columns: [t.snapshotId, t.companyId] })]);

export const dataSources = sqliteTable("data_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  implementation: text("implementation").notNull(),
  state: text("state").notNull(),
  stateReason: text("state_reason"),
  lastAttemptAt: text("last_attempt_at"),
  lastSuccessAt: text("last_success_at"),
  latestDataDate: text("latest_data_date"),
  descriptorJson: text("descriptor_json").notNull(),
});

export const sourceDocuments = sqliteTable("source_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceId: text("source_id").notNull(),
  externalId: text("external_id").notNull(),
  url: text("url"),
  community: text("community"),
  authorHash: text("author_hash"),
  title: text("title").notNull(),
  bodyPreview: text("body_preview").notNull(),
  publishedAt: text("published_at").notNull(),
  publishedDate: text("published_date").notNull(),
  collectedAt: text("collected_at").notNull(),
  engagementScore: real("engagement_score").notNull(),
  engagementComments: real("engagement_comments").notNull(),
  lang: text("lang").notNull(),
  dedupeStatus: text("dedupe_status").notNull(),
  duplicateOf: text("duplicate_of"),
  isSynthetic: integer("is_synthetic", { mode: "boolean" }).notNull(),
}, (t) => [
  uniqueIndex("source_documents_ext_uq").on(t.sourceId, t.externalId),
  index("source_documents_date_idx").on(t.sourceId, t.publishedDate),
]);

export const companyMentions = sqliteTable("company_mentions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("document_id").notNull().references(() => sourceDocuments.id),
  ticker: text("ticker").notNull(),
  sourceId: text("source_id").notNull(),
  date: text("date").notNull(),
  bestReason: text("best_reason").notNull(),
  reasons: text("reasons").notNull(),
  matchedTexts: text("matched_texts").notNull(),
  relevance: real("relevance").notNull(),
  ambiguous: integer("ambiguous", { mode: "boolean" }).notNull(),
}, (t) => [
  index("company_mentions_ticker_date_idx").on(t.ticker, t.date),
  index("company_mentions_doc_idx").on(t.documentId),
]);

export const sentimentResults = sqliteTable("sentiment_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("document_id").notNull().references(() => sourceDocuments.id),
  ticker: text("ticker").notNull(),
  modelVersionId: integer("model_version_id").notNull(),
  label: text("label").notNull(),
  score: real("score").notNull(),
  confidence: real("confidence").notNull(),
  aspect: text("aspect").notNull(),
  direction: text("direction"),
  matchedTerms: text("matched_terms").notNull(),
  sarcasm: integer("sarcasm", { mode: "boolean" }).notNull(),
  uncertain: integer("uncertain", { mode: "boolean" }).notNull(),
  processedAt: text("processed_at").notNull(),
}, (t) => [index("sentiment_results_doc_ticker_idx").on(t.documentId, t.ticker)]);

/** One row per company × source × UTC day. Missing days have no row (never zero-filled). */
export const dailySourceMetrics = sqliteTable("daily_source_metrics", {
  ticker: text("ticker").notNull(),
  sourceId: text("source_id").notNull(),
  date: text("date").notNull(),
  /** Primary activity measure: mentions (text), page views, search index, developer events. */
  value: real("value").notNull(),
  mentionCount: integer("mention_count"),
  uniqueAuthors: integer("unique_authors"),
  engagementAdj: real("engagement_adj"),
  posShare: real("pos_share"),
  negShare: real("neg_share"),
  netSentiment: real("net_sentiment"),
  sentimentWeight: real("sentiment_weight"),
  sentimentConfidence: real("sentiment_confidence"),
  investmentSentiment: real("investment_sentiment"),
  productSentiment: real("product_sentiment"),
  reputationSentiment: real("reputation_sentiment"),
  dupRatio: real("dup_ratio"),
  botRatio: real("bot_ratio"),
  ambiguityRatio: real("ambiguity_ratio"),
  communityCount: integer("community_count"),
  communityHhi: real("community_hhi"),
  isSynthetic: integer("is_synthetic", { mode: "boolean" }).notNull(),
  collectedAt: text("collected_at").notNull(),
}, (t) => [
  primaryKey({ columns: [t.ticker, t.sourceId, t.date] }),
  index("daily_source_metrics_date_idx").on(t.date),
]);

/** Point-in-time per-source features (inputs to the composite). */
export const signalComponents = sqliteTable("signal_components", {
  ticker: text("ticker").notNull(),
  sourceId: text("source_id").notNull(),
  date: text("date").notNull(),
  featuresJson: text("features_json").notNull(),
}, (t) => [primaryKey({ columns: [t.ticker, t.sourceId, t.date] }), index("signal_components_date_idx").on(t.date)]);

export const dailyCompanySignals = sqliteTable("daily_company_signals", {
  ticker: text("ticker").notNull(),
  date: text("date").notNull(),
  altSignalScore: real("alt_signal_score"),
  rawScore: real("raw_score"),
  attentionScore: real("attention_score"),
  sentimentScore: real("sentiment_score"),
  attentionAcceleration: real("attention_acceleration"),
  sentimentChange: real("sentiment_change"),
  agreement: real("agreement"),
  divergence: real("divergence"),
  confidence: real("confidence").notNull(),
  anomalyScore: real("anomaly_score"),
  hypeRisk: text("hype_risk").notNull(),
  detailJson: text("detail_json").notNull(),
  modelVersion: text("model_version").notNull(),
}, (t) => [primaryKey({ columns: [t.ticker, t.date] }), index("daily_company_signals_date_idx").on(t.date)]);

/** Outcome-label data. Never read by the feature/signal pipeline. */
export const marketPrices = sqliteTable("market_prices", {
  ticker: text("ticker").notNull(),
  date: text("date").notNull(),
  close: real("close").notNull(),
  provider: text("provider").notNull(),
  isSynthetic: integer("is_synthetic", { mode: "boolean" }).notNull(),
}, (t) => [primaryKey({ columns: [t.ticker, t.date] })]);

export const forwardReturns = sqliteTable("forward_returns", {
  ticker: text("ticker").notNull(),
  signalDate: text("signal_date").notNull(),
  horizon: integer("horizon").notNull(),
  entryDate: text("entry_date").notNull(),
  exitDate: text("exit_date").notNull(),
  ret: real("ret").notNull(),
}, (t) => [primaryKey({ columns: [t.ticker, t.signalDate, t.horizon] })]);

export const backtestRuns = sqliteTable("backtest_runs", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  paramsJson: text("params_json").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  durationMs: integer("duration_ms"),
  isSynthetic: integer("is_synthetic", { mode: "boolean" }).notNull(),
});

export const backtestResults = sqliteTable("backtest_results", {
  runId: text("run_id").primaryKey().references(() => backtestRuns.id),
  resultJson: text("result_json").notNull(),
});

export const ingestionRuns = sqliteTable("ingestion_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  mode: text("mode").notNull(),
  sourceId: text("source_id").notNull(),
  status: text("status").notNull(),
  rangeStart: text("range_start").notNull(),
  rangeEnd: text("range_end").notNull(),
  documentsIn: integer("documents_in").notNull().default(0),
  documentsKept: integer("documents_kept").notNull().default(0),
  mentions: integer("mentions").notNull().default(0),
  observations: integer("observations").notNull().default(0),
  errorsJson: text("errors_json").notNull().default("[]"),
});

export const dataQualityEvents = sqliteTable("data_quality_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  sourceId: text("source_id"),
  ticker: text("ticker"),
  date: text("date"),
  severity: text("severity").notNull(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
}, (t) => [index("data_quality_events_src_idx").on(t.sourceId, t.date)]);

export const modelVersions = sqliteTable("model_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  description: text("description").notNull(),
  paramsJson: text("params_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("model_versions_uq").on(t.kind, t.name, t.version)]);

export const anomalyEvents = sqliteTable("anomaly_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  date: text("date").notNull(),
  sourceId: text("source_id").notNull(),
  kind: text("kind").notNull(),
  z: real("z").notNull(),
  description: text("description").notNull(),
}, (t) => [index("anomaly_events_date_idx").on(t.date), index("anomaly_events_ticker_idx").on(t.ticker)]);

/** Key/value metadata, e.g. dataset mode, as-of date, synthetic flag. */
export const datasetMeta = sqliteTable("dataset_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
