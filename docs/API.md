# API

All routes return JSON (except CSV export), are server-rendered on demand, validate input with Zod (`400` with `issues[]` on failure), return `503` if the database has not been seeded, and never include credentials. Responses in demo mode carry `meta.isSynthetic: true` or `isSynthetic: true`.

Common view query (`window`, `source`, `sector`, `minConfidence`):

| Param | Values | Default |
| --- | --- | --- |
| `window` | `7`, `30`, `90` (days) | `30` |
| `source` | `all`, `reddit`, `hackernews`, `wikipedia`, `search`, `github` | `all` |
| `sector` | a GICS sector name or `all` | `all` |
| `minConfidence` | 0–100 | `0` |

With a single `source`, `score` is `null` (the composite needs all sources) and attention/sentiment come from that source only.

## GET /api/universe
Dated universe snapshot: `asOf, provider, isLive, isSynthetic, companies[] {ticker, name, exchange, sector, industry, rank, marketCapUsd, previousTickers}`. Cache 5 min.

## GET /api/overview
Everything on the overview page: `meta, query, allSectors, sources[], kpis {mood, moodChange, breadth, abnormalAttention, anomalies, avgConfidence, sourcesActive, sourcesTotal, universe}, moodSeries[] {date, mood, p25, p75, attention, n}, heatmap[], histogram[], scatter[], bullish[], bearish[], rising[], unusual[], disagreements[], anomalies[], ranked[]`. Cache 60 s.

## GET /api/stocks
`{meta, query, sectors, rows: StockRow[]}` for all companies. Add `format=csv` for a CSV download whose `#` preamble states the as-of date, demo status and disclaimer. `StockRow` fields are listed in DATA_DICTIONARY.md.

## GET /api/stocks/:ticker?window=90
Company detail: `company, latest (full CompanySignal), history[], activity[], items[] (previews with match reason and sentiment), narratives[], anomalies[], sources[], scoreVsReturn[]`. `window` 7–240. Previous tickers resolve (e.g. `FB` → META). `404` for unknown tickers; `400` for malformed ones.

## GET /api/stocks/:ticker/signals?start=&end=
Daily `CompanySignal` objects with components, contributions, penalties, confidence factors, per-source values and unusual signals.

## GET /api/stocks/:ticker/sources?days=30
Daily per-source aggregate rows (`daily_source_metrics`) — no raw text. `days` 1–240.

## GET /api/sectors
Per-sector company count and average score, sentiment and attention on the as-of date.

## GET /api/data-status
Mode, as-of, source states with rate-limit and licence notes, latest ingestion runs, data-quality events, model versions, universe snapshots.

## POST /api/signal-lab/run
Body (all optional):

```json
{
  "features": ["altSignalScore"],          // 1–4 of the keys in src/config/lab.ts
  "featureWeights": [1, -0.5],             // when several features
  "componentWeights": {"sentiment": 0.4},  // composite only; normalised
  "excludeSources": ["github"],            // composite only
  "horizon": 5,                            // 1 | 5 | 10 | 20 trading days
  "start": "2026-03-12", "end": "2026-09-30",
  "universe": "all",                       // all | top50 | top25
  "sectors": [],
  "minConfidence": 0
}
```

Returns `{runId, result}`; `result` contains `verdict, summary, quintiles, curve, splits, walkForward, baselines, bySector, byMonth, regimes, sensitivity, coverage, integrity, icSeries, warnings`. `422` when there are too few usable cross-sections or no price labels; `429` after 10 runs/min per client; `413` for bodies > 10 kB.

## GET /api/signal-lab/:runId
A stored run: `{run {id, createdAt, params, status, durationMs, isSynthetic}, result}`. `runId` must be a UUID.

## POST /api/admin/refresh
Incremental re-ingestion of the last `days` (1–60, default 3), then signal recompute and cache invalidation. Disabled (`404`) unless `ADMIN_TOKEN` is set; requires `Authorization: Bearer <ADMIN_TOKEN>` (`401` otherwise); `409` if a refresh is running; 3 calls/min.

```bash
curl -X POST localhost:3000/api/admin/refresh -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{"days":3}'
```
