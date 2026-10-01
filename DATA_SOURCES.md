# Data sources

Status legend: **Live adapter** = implemented against the official/public API (tested with recorded response shapes; the build sandbox could not reach the APIs, so none has been exercised against the real endpoint yet). **Fixture** = deterministic synthetic twin with the identical schema, used in demo mode. **Planned** = interface slot and documentation only.

| Source | Live adapter | Fixture | Credentials | Rate limit / access | Licence considerations | Refresh | History |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Reddit posts | ✅ `live/reddit.ts` (OAuth app-only, `/r/{sub}/new`) | ✅ | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`; without them the source is *unavailable* | ≤ 100 QPM (self-throttled to ~85); descriptive User-Agent | Reddit Data API Terms: non-commercial use on the free tier; commercial use needs an agreement; deleted content must be removed; no resale | hourly → daily aggregates | listing depth only (~1,000 newest per community); no historical backfill |
| Hacker News | ✅ `live/hackernews.ts` (Algolia `search_by_date`) | ✅ | none | Algolia public API; self-throttled to 2 req/s | Content belongs to authors; store previews and aggregates | hourly | full archive |
| Wikipedia page views | ✅ `live/wikipedia.ts` (Wikimedia REST per-article, `agent=user`) | ✅ | none (send contact in `ALTSIGNAL_CONTACT`) | ~100 req/s ceiling; self-throttled to ~7 req/s | CC0 | daily (previous UTC day) | since 2015-07 |
| GitHub developer activity | ✅ `live/github.ts` (org public events) | ✅ | optional `GITHUB_TOKEN` | 60 req/h unauthenticated, 5,000 with token | GitHub API Terms; public metadata only | daily | public events API covers ~90 days / 300 events per org |
| Search interest | ❌ planned | ✅ | a licensed SERP/Trends vendor key | vendor-specific | Google has no official Trends API and scraping is not permitted, so no adapter is shipped | daily | vendor-specific |
| Universe (market cap) | ✅ `live/fmp-universe.ts` + `npm run universe:refresh` | bundled dated sample | `FMP_API_KEY` | plan-dependent | FMP terms; display/redistribution rights depend on plan | on demand | n/a |
| Prices (outcome labels) | ❌ planned (licensed vendor) | ✅ synthetic | vendor key | — | most price data cannot be redistributed | daily | — |

Other candidates from the brief (X/Twitter, YouTube, app stores, job postings, SEC filing novelty, patents, prediction markets, outage reports) are not implemented. SEC EDGAR filing-language novelty is the most attractive next source: free, official, point-in-time and legally clear (requires a descriptive User-Agent, ≤ 10 req/s).

## Normalised schema

Every adapter returns a `ProviderBatch`:

- `documents: RawDocument[]` — `sourceId, externalId, url, community, authorHash (salted SHA-256, never the handle), title, body, publishedAt, collectedAt, engagement {score, comments}, isSynthetic`
- `observations: NumericObservation[]` — `sourceId, ticker, date (UTC), value, collectedAt, isSynthetic, meta`
- `coveredDates`, `fetchedAt`, `quality {requested, received, errors[]}`

Both shapes are Zod schemas in `src/lib/providers/types.ts`. Fixture and live data are indistinguishable to the pipeline except for `isSynthetic`, which is stored on every row, surfaced as `dataset_meta.isSynthetic`, the DEMO DATA badge, and the CSV preamble.

## Mapping companies to sources

`src/data/entities.ts` holds, per ticker: short names, products, subsidiaries, misspellings, exclusion phrases, ambiguous aliases, the Wikipedia article title, GitHub organisations and the search term. Unmapped companies fall back to a suffix-stripped name and have no Wikipedia/GitHub coverage.

## Demo fixtures

`src/lib/providers/fixtures/` generates, from a fixed seed, latent per-company attention (shared AR(1) plus a market factor plus source-specific AR(1) noise) and tone by aspect (AR(1) plus market mood). Each source observes these with its own noise, coverage and biases:

- Reddit ~ Poisson counts scaled by size and a "retail favourite" factor; sector and investing communities; engagement log-normal; occasional cross-posts, non-English items and off-topic noise (apple pie, student visas, "NOW is the time…") that the resolver should reject.
- Hacker News — tech-heavy, product/reputation-heavy.
- Wikipedia — weekday seasonality, 1% random gaps.
- Search — ~12% of companies lack enough volume; the feed lags 3 days, so it shows as **stale**.
- GitHub — only companies with mapped organisations; weekends quieter.
- Simulated outages: Reddit days −120…−118, Hacker News −75…−69, Wikipedia −140, GitHub −95…−94 (relative to 2026-09-30).

**Planted scenario events** (`fixtures/events.ts`): NVDA cross-source launch surge (−20 d), BA safety narrative (−35 d), PLTR Reddit-only hype with bot repetition (−10 d), CRWD outage with product/investment split (−50 d), INTC developer-activity acceleration (−25 d), UNH Wikipedia-only shock (−60 d), DIS Reddit-vs-HN disagreement (−15 d), HOOD retail crowding (−4 d). Synthetic prices include the documented coupling described in METHODOLOGY.md §8.

None of this is real. Demo links use the reserved `.invalid` domain and are not clickable.

## Retention and privacy

- Raw items: previews (title ≤ 300, body ≤ 500 characters) for 45 days, as an audit trail. Older items are not stored; daily aggregates are kept.
- No usernames, profile data, images or private content are collected. Authors are salted hashes (`ALTSIGNAL_AUTHOR_SALT`).
- NSFW Reddit posts are skipped.
- Credentials live in environment variables, read only on the server.
