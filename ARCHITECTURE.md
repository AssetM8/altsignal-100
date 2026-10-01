# Architecture

## Shape of the system

```
                  ┌──────────────────────── ingestion (npm run seed / refresh / POST /api/admin/refresh) ────────────────────────┐
UniverseProvider ─┤                                                                                                               │
 (file | FMP)     │  AlternativeDataProvider ×5 ──► text: clean → language → dedupe → EntityResolver → TextClassifier → aggregate │
                  │  (live | fixture, same schema)   numeric: observations ─────────────────────────────────────────────► daily rows │
                  │                                                     │                                                         │
                  │                                   daily_source_metrics (missing days stay missing)                            │
                  │                                                     ▼                                                         │
                  │                         computeSourceFeatures  (point-in-time, per company × source × day)                    │
                  │                                                     ▼                                                         │
                  │                         computeSignalsForDate  (cross-source composite, same-day standardisation)             │
                  │                                                     ▼                                                         │
                  │                  signal_components · daily_company_signals · anomaly_events                                   │
MarketDataProvider ──► market_prices ──► forward_returns   (outcome labels only — no path into the signal code)                  │
                  └───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                        ▼
                      services/dataset.ts — in-memory snapshot, rebuilt when dataset_meta.lastRefreshAt changes
                                                        ▼
         services/views.ts (overview, explorer, company, status) · services/lab.ts (Signal Lab)  ──►  pages + /api routes
```

One Next.js process serves pages and JSON APIs. Ingestion is a library called from CLI scripts or the protected admin route; there are no extra services.

## Repository layout

```
src/
  app/                    pages (App Router) and api/ route handlers
  components/             UI: ui.tsx primitives, charts/ (Recharts, lazy-loaded), explorer, lab, filters, shell
  config/                 product.ts (name), signal.ts (every weight/threshold), env.ts (Zod-validated env), lab.ts
  data/                   universe snapshot JSON, entities.ts (aliases, ambiguity, exclusions, source mappings)
  lib/
    providers/            types.ts (interfaces + Zod schemas), registry.ts, descriptors.ts, universe.ts
      live/               wikipedia, hackernews, reddit, github, fmp-universe, http helpers
      fixtures/           world.ts (synthetic latent processes), text.ts, providers.ts, prices.ts, events.ts
    nlp/                  clean, lang, dedupe (SimHash), entity-resolver, sentiment (lexicon classifier)
    pipeline/             process-text.ts (doc → mentions → daily metrics), ingest.ts (orchestration, persistence)
    signals/              features.ts (per-source, point-in-time), composite.ts (scores, penalties, anomalies)
    backtest/             labels.ts (forward returns), engine.ts (IC, quintiles, splits, walk-forward, bootstrap)
    services/             dataset.ts (snapshot cache), views.ts, lab.ts
    db/                   schema.ts (Drizzle), client.ts, migrate.ts
scripts/                  migrate, seed, refresh, universe-refresh, dev/screenshot.mjs
tests/unit, tests/integration, e2e/   Vitest and Playwright
drizzle/                  SQL migrations
docs/                     API.md, DATA_DICTIONARY.md, screenshots/
```

## Key interfaces (`src/lib/providers/types.ts`)

| Concept | Implementation |
| --- | --- |
| `UniverseProvider` | `FileUniverseProvider` (dated JSON), `FmpUniverseProvider` |
| `AlternativeDataProvider` | descriptor (identity, kind, history, refresh, rate limit, licence, biases), `status()`, `fetch()` → `ProviderBatch` (documents or observations + quality metadata + covered dates) |
| `MarketDataProvider` | `FixtureMarketDataProvider`; live provider deliberately not bundled |
| `EntityResolver` | `nlp/entity-resolver.ts` |
| `TextClassifier` | `LexiconClassifier`; swap in another model behind the same `classify(text, focusOffsets)` |
| FeaturePipeline | `signals/features.ts#computeSourceFeatures` |
| SignalEngine | `signals/composite.ts#computeSignalsForDate` |
| BacktestEngine | `backtest/engine.ts` + `services/lab.ts` |
| DataQualityService | coverage-gap, stale, fetch-error and provider-unavailable events written by `pipeline/ingest.ts` |

Fixture and live adapters return identical Zod-validated shapes; `registry.ts` chooses per mode and wraps disabled or credential-less sources in `UnavailableProvider`. Dashboard code only sees the database, so swapping providers needs no UI change. Adding a source means: a descriptor, an adapter (and fixture), an entry in `SOURCE_IDS` and the source weights in `config/signal.ts`.

## Design decisions

**Drizzle + libSQL instead of Prisma + PostgreSQL.** Prisma needs engine binaries downloaded from a CDN that the build environment could not reach, so it could not have been run or tested. Drizzle is pure TypeScript, its migrations are plain SQL, and libSQL runs as an embedded SQLite file locally or as a network server (`libsql://`) in production. The schema uses only portable column types; moving to PostgreSQL means re-declaring `schema.ts` with `drizzle-orm/pg-core` and swapping the client — not done or tested here.

**TypeScript-only analytics.** The NLP is a transparent lexicon model and the statistics are a small hand-written toolkit (`util/stats.ts`) with unit tests, so a Python service would have added deployment weight without adding credibility. The `TextClassifier` interface is where a FinBERT service would plug in.

**Precompute, then cache.** Signals for every day are computed during ingestion and stored. The app loads them once per refresh into memory (~24k company-days); pages filter and aggregate on the server and send only aggregates. Raw items are never sent except as previews for the company audit trail.

**Runtime source removal.** `ALTSIGNAL_DISABLED_PROVIDERS` makes the snapshot recompute composites from stored per-source features without those sources — the same path the Lab uses for custom weights and source-removal sensitivity.

**Price isolation.** Prices are written to `market_prices`/`forward_returns` by the ingestion step and read only by the Lab and the company "score vs next return" chart. A unit test fails if signal modules import price code.

## Performance notes

- Demo seed: ~87k Reddit and ~17k Hacker News items processed, ~52k numeric observations, 100k feature rows, 24k signals in about 90 s on one core; long synchronous loops yield to the event loop.
- Batched inserts (200–500 rows), indexes on `(ticker, date)`, `(source_id, date)` and `date`.
- Charts are code-split (`next/dynamic`, `ssr:false`) with skeleton placeholders. Explorer data (100 rows) is filtered client-side with pagination.
- API responses carry `Cache-Control: private, max-age=…`; Lab runs are rate-limited to 10/min per client and capped at 10 kB request bodies.

## Security

Zod validation on every route and query; secrets only in server env (`config/env.ts` is imported only by server code; `server-only` guards services); admin refresh disabled unless `ADMIN_TOKEN` is set and compared in constant time; rate limits; external text cleaned to plain text and rendered through React (no `dangerouslySetInnerHTML`, enforced by ESLint `react/no-danger`); outbound links `rel="noopener noreferrer nofollow"`; CSV export guards against formula injection; author handles hashed with a salt; security headers in `next.config.ts`. `npm audit --omit=dev` reports 0 vulnerabilities (PostCSS is pinned via `overrides`); dev-only tooling has moderate advisories (Vitest/esbuild dev servers) that do not ship.
