# Development

## Setup

```bash
npm install
cp .env.example .env.local     # optional
npm run setup                  # migrate + demo seed (~90 s)
npm run dev                    # http://localhost:3000
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run lint` | ESLint (flat config, `next/core-web-vitals` + TypeScript), zero warnings allowed |
| `npm run typecheck` | `tsc --noEmit` in strict mode |
| `npm test` | all Vitest suites; `test:unit`, `test:integration` separately |
| `npm run build && npm run test:e2e` | Playwright against two `next start` servers (:3100 demo, :3101 with Hacker News disabled) |
| `npm run check` | lint + typecheck + tests |
| `npm run seed` | rebuild the database for the current `ALTSIGNAL_MODE` |
| `npm run refresh -- --days N` | re-ingest the last N days and recompute signals |
| `npm run db:generate` | write a migration after editing `src/lib/db/schema.ts` |
| `node scripts/dev/screenshot.mjs URL out.png [width]` | full-page screenshot (set `WAIT=ms` for charts) |

## Tests

- **Unit** (`tests/unit`, 43): entity resolution and ambiguous tickers, sentiment (aspect, negation, sarcasm, windowing), cleaning/language/dedupe, aggregation (zero vs missing), point-in-time features and a look-ahead mutation test, composite (direction, confidence and penalty shrinkage, missing data, source exclusion, no price imports), forward-return alignment, IC/quintile statistics with planted and null relationships, splits and walk-forward.
- **Integration** (`tests/integration`, 23): fixture providers → SQLite ingestion over 120 days (own DB file `data/test-integration.db`), idempotent re-ingestion, every API route including validation errors and admin protection, Signal Lab run/persist/reload and custom weights, runtime provider disabling, and the live adapters against recorded response shapes.
- **E2E** (`e2e`, 11): dashboard, URL filters, header search, explorer filtering/sorting/presets, CSV export contents, company page, 404, Signal Lab run, degraded server with a disabled provider, mobile overflow on six pages.

Playwright needs Chromium: `npx playwright install chromium`, or point `PW_CHROMIUM_PATH` at an existing binary.

## Conventions

- All tunable numbers go in `src/config/signal.ts`; the product name only in `src/config/product.ts`.
- Dates are `YYYY-MM-DD` UTC strings; use `src/lib/util/dates.ts`.
- Missing values are `null`, never `0`, and sort last in tables.
- Anything that reads env or the database imports `server-only`.
- UI: values with direction use `<Signed>` (sign + ▲/▼, not colour alone); tables use `.grid-table`; panels use `<Panel>` with a note stating units, timezone and source.

## Adding a data source

1. Add the id to `SOURCE_IDS` and give it weights in `config/signal.ts`.
2. Add a descriptor in `providers/descriptors.ts` (rate limit, licence, biases, credentials).
3. Implement `AlternativeDataProvider` in `providers/live/` returning `documents` (text) or `observations` (numeric), plus a fixture twin.
4. Wire both in `providers/registry.ts`; add source mappings to `data/entities.ts` if needed.
5. Add a recorded-shape test in `tests/integration/live-adapters.test.ts`.

The feature, composite, UI and Lab layers pick the new source up without changes.

## Replacing the classifier

Implement `TextClassifier` (`classify(text, focusOffsets) → SentimentResult`, `info {name, version}`) and pass it as `classifier` to `runIngestion`. The model name and version are stored with every sentiment row.
