# Limitations

Read this before drawing any conclusion from the app.

## Data

- **Demo data is synthetic.** Every alt-data item, aggregate, event and price in demo mode comes from a generator with a fixed seed. Patterns, scenario events and the planted price link were put there on purpose. Nothing in demo mode is an observation of a real company.
- **Live adapters are untested against real endpoints.** The build environment blocked network access to Reddit, Hacker News, Wikimedia and GitHub. The adapters follow the documented APIs and pass recorded-shape tests, but field changes, pagination edge cases and rate-limit behaviour have not been verified live.
- **No live search-interest or price provider.** Search interest is fixture-only. Live mode has no outcome labels, so the Signal Lab returns an explanatory error.
- **The bundled universe is an approximate, hand-compiled snapshot** dated 2026-06-30, with rounded market caps. It is not authoritative and may misrank companies near the cut-off.
- **Reddit history is shallow** (listing depth only) and the free API tier is for non-commercial use. **GitHub public events** cover about 90 days and only ~35% of the universe has mapped organisations.
- Wikipedia tracks one English article per company; renames and redirects can break a series.

## Method

- **Survivorship bias**: one universe snapshot is applied to the whole history; companies that dropped out of the top 100, merged or delisted are absent.
- **Short history**: 240 days with a 37-day warm-up leaves ~165 trading days, i.e. ~33 non-overlapping 5-day periods. Confidence intervals are wide; sector and month breakdowns are thin.
- **Multiple testing**: the Lab makes it easy to try many features, horizons and weights. Expect spurious "significant" results; the held-out split helps only if you do not iterate on it.
- **Costs and capacity** are ignored. Spread curves are gross, equal-weighted research diagnostics, not strategies.
- **Lexicon sentiment** is transparent but crude: it misses context, domain slang it does not know, irony without markers, and non-English text (which is dropped). Aspect detection is keyword-based.
- **Entity resolution** is rule-based. New products, nicknames and tickers that collide with words need manual entries in `src/data/entities.ts`.
- **Weights are judgemental**, not estimated. The only change from the brief's starting weights is documented in METHODOLOGY.md §6.
- **Attention can follow price.** People search for and discuss stocks that just moved; an attention signal can therefore be a lagging echo of returns. The Lab measures the association; it does not establish direction.
- **Coverage changes over time** (outages, stale feeds, companies without GitHub/search data) alter what the composite is made of; the Lab warns when coverage shifts by more than 10 points.

## Engineering

- SQLite/libSQL is the only database tested. PostgreSQL is a documented migration path, not an implemented one (see ARCHITECTURE.md).
- The Dockerfile and docker-compose file were written but not run (no Docker in the build environment).
- Rate limiting is in-memory per process; a multi-instance deployment needs a shared store.
- Delisted-company and ticker-change handling covers known previous tickers in the universe file only.
- `npm audit` reports moderate advisories in dev-only tooling (Vitest/esbuild dev servers); production dependencies report none.
