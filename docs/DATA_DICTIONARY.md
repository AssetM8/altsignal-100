# Data dictionary

Dates are UTC `YYYY-MM-DD`; timestamps ISO-8601 UTC. `is_synthetic` marks demo rows.

## Tables

| Table | Grain | Key columns |
| --- | --- | --- |
| `companies` | company | `ticker` (unique), name, exchange, sector, industry |
| `securities` | identifier over time | company_id, ticker, name_at_time, share_class, valid_from, valid_to (previous tickers have valid_to) |
| `universe_snapshots` | dated snapshot | as_of, provider, is_live, description, selection_rules |
| `universe_members` | snapshot × company | rank, market_cap_usd, source_timestamp |
| `data_sources` | source | state (live/demo/stale/unavailable), state_reason, last_success_at, latest_data_date, descriptor_json |
| `source_documents` | public item (45-day retention) | source_id, external_id, url, community, author_hash, title/body_preview, published_at/date, collected_at, engagement, lang, dedupe_status, duplicate_of |
| `company_mentions` | item × company | best_reason, reasons, matched_texts, relevance, ambiguous |
| `sentiment_results` | item × company | model_version_id, label, score, confidence, aspect, direction, matched_terms, sarcasm, uncertain |
| `daily_source_metrics` | company × source × day | see below; **no row = not collected** |
| `signal_components` | company × source × day | features_json (SourceFeatures) |
| `daily_company_signals` | company × day | headline metrics + detail_json (components, contributions, penalties, …), model_version |
| `anomaly_events` | event | ticker, date, source_id, kind, z, description |
| `market_prices` | ticker × trading day | close, provider (outcome data only) |
| `forward_returns` | ticker × signal date × horizon | entry_date (> signal_date), exit_date, ret |
| `backtest_runs` / `backtest_results` | Lab run | params_json, status, duration_ms / result_json |
| `ingestion_runs` | source × run | range, documents_in/kept, mentions, observations, errors_json |
| `data_quality_events` | event | severity, kind (coverage_gap, stale, fetch_error, provider_unavailable), message |
| `model_versions` | model | kind, name, version |
| `dataset_meta` | key/value | mode, asOf, isSynthetic, lastRefreshAt, universeAsOf, compositeModel, classifierModel, pricesAvailable, pricesSynthetic |

## daily_source_metrics

| Column | Meaning |
| --- | --- |
| `value` | primary activity: mentions (text), page views, search index 0–100, GitHub events |
| `mention_count`, `unique_authors` | unique, English, relevance ≥ 0.5 items; distinct author hashes |
| `engagement_adj` | Σ relevance × (1 + ln(1+score)/2 + ln(1+comments)/4) |
| `net_sentiment`, `sentiment_weight`, `sentiment_confidence` | weighted mean polarity [−1,1], its total weight, mean classifier confidence |
| `pos_share`, `neg_share` | weighted share of positive / negative items |
| `investment_ / product_ / reputation_sentiment` | aspect-level mean polarity |
| `dup_ratio`, `bot_ratio`, `ambiguity_ratio` | share of duplicate, bot-like and context-only matches |
| `community_count`, `community_hhi` | distinct communities, Herfindahl concentration |

## Headline metrics (StockRow / CompanySignal)

| Field | Range | Meaning |
| --- | --- | --- |
| `altSignalScore` | 0–100, 50 neutral | composite after confidence and penalties |
| `rawScore` | 0–100 | composite before adjustments |
| `attentionScore` | 0–100, 50 normal | Φ(weighted abnormal-attention z) × 100 |
| `sentimentScore` | −100…+100 | 100 · tanh(2.5 · weighted sentiment) |
| `attentionAcceleration`, `sentimentChange` | σ | same-day cross-sectional z-scores |
| `agreement`, `divergence` | 0–100 | cross-source consistency / largest conflict |
| `confidence` | 0–100 | coverage, sample, freshness, quality |
| `anomalyScore` | 0–100 | Bonferroni-adjusted extremeness of the largest z |
| `hypeRisk` | low / elevated / high | retail crowding without confirmation |
| `scoreChange` | points | score change over the selected window |
| `freshnessDays` | days | age of the oldest source input used today |
| `unusual.*` | — | wikiShock (z), productDivergence (polarity gap), devAcceleration (z), communityBreadth (1/HHI), retailCrowding (σ gap), searchAcceleration (z) |
