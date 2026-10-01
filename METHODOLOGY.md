# Methodology

All parameters below live in `src/config/signal.ts`. Nothing in the signal path uses prices, returns, valuation, technical indicators, analyst estimates or fundamentals; market capitalisation is used only to select the universe.

## 1. Universe

The top 100 US-domiciled operating companies listed on NYSE or NASDAQ by market capitalisation, one share class per issuer (GOOGL not GOOG, BRK.B not BRK.A), excluding ETFs, funds, SPACs, preferreds, warrants and foreign-domiciled ADRs. The bundled file `src/data/universe/sample-universe-2026-06-30.json` is a dated, hand-compiled sample with approximate market caps; it is not live and says so in the UI. Previous identifiers (FB→META, etc.) are stored in `securities` and resolve in URLs and text. `npm run universe:refresh` rebuilds the snapshot from a licensed provider with the same rules.

## 2. Time conventions

- An alt-data day is a UTC calendar day: items published in `[d 00:00Z, d+1 00:00Z)`.
- A signal dated `d` uses only observations dated ≤ `d`. In US terms that is after the 16:00 ET close.
- Forward-return labels start at the **next** trading-day close after `d` and run `h` trading days: `close(entry+h)/close(entry) − 1`. Labels that would need prices beyond the last available date are not created.
- The demo market calendar is Monday–Friday without exchange holidays.

## 3. Text pipeline

1. **Clean** HTML, entities, control and zero-width characters; cap at 4,000 characters.
2. **Language**: English stop-word coverage and Latin-script share; non-English items are excluded from metrics.
3. **De-duplicate** in publication order: canonical external URL (same community = repost, different = cross-post), normalised exact text, and 64-bit SimHash over word bigrams with Hamming distance ≤ 3 (banded index). An author whose items are duplicates twice more is flagged `bot_repeat`. Only `unique` items count; the rest feed the duplicate and bot ratios.
4. **Resolve companies** by whole-token matching (not substrings): cashtags (any ticker), bare uppercase tickers, official and short names, products, subsidiaries, misspellings and previous tickers; longest alias wins. Word-like or ≤ 2-letter tickers (T, NOW, CAT, MA…) and ambiguous names (Apple, Amazon, Visa, Meta, Oracle, Tesla…) need evidence within ±8 tokens (market words such as *stock, shares, earnings, calls*) or another unambiguous alias of the same company in the item. Exclusion phrases (*apple pie, student visa, amazon rainforest, nikola tesla, meta-analysis…*) veto a match; bare tickers in all-caps shouting are ignored. Every mention stores its reasons and matched text. Relevance starts from the strongest reason (cashtag 0.95 … subsidiary 0.55), rises slightly with repeats and title presence, and is diluted when an item names 3+ or 5+ companies. Mentions below relevance 0.5 are ignored.
5. **Sentiment** (`altsignal-lexicon` 1.0.0): finance and social lexicon plus phrases, negation within three tokens (×−0.8), intensifiers and diminishers, `score = tanh(raw/3)`. Sarcasm markers (*/s, yeah right, what could go wrong, 🙃…*) halve and flip the score and cut confidence; hedged questions become `uncertain`. Aspect comes from cue words around the mention: investment, product, reputation or general. **Only investment-aspect items receive a bullish/bearish direction** — product praise is product sentiment, not a stock view. Long items are scored in a ±25-token window around the mention.
6. **Aggregate** per company × UTC day: mentions, unique (hashed) authors, engagement-weighted mentions `w = relevance × (1 + ln(1+score)/2 + ln(1+comments)/4)`, sentiment weighted by `w × confidence × aspect weight` (investment 1.0, reputation 0.75, general 0.6, product 0.5), positive/negative shares, per-aspect sentiment, duplicate/bot/ambiguity ratios, community count and Herfindahl concentration.

A text source that was collected on a day but had no mention of a company gets an explicit zero row. A day the source was not collected has no row — it stays missing.

## 4. Per-source features (point in time)

For each company × source × day `t`, using rows dated ≤ `t` only:

| Feature | Definition |
| --- | --- |
| level | `ln(1 + engagement-weighted mentions)` for text; `ln(1 + value)` for numeric sources |
| 7-day mean `m(t)` | mean level over `t−6…t`, needs ≥ 4 observations |
| abnormal attention z | `(m(t) − median(B)) / max(MAD(B), SD(B), 0.08)`, `B` = the 7-day means ending `t−7…t−36` (≥ 20 required), clipped to ±4 |
| acceleration | `(mean level t−2…t − mean level t−9…t−3) / (SD of daily levels t−7…t−36 / √2)`, clipped to ±4 |
| sentiment (7d) | `Σ(w·s) / (Σw + 4)` — shrinks thin samples toward 0; needs ≥ 3 mentions |
| aspect sentiment | same with prior 6 |
| sentiment change | 7-day sentiment minus the previous week's |
| quality | 7-day duplicate, bot and ambiguity ratios; community breadth `1/HHI` |
| freshness | days since the last observation; a source is *available* only with a valid z and freshness ≤ 7 days |

## 5. Cross-source metrics

Weights: attention — Reddit 30%, Wikipedia 25%, search 20%, Hacker News 15%, GitHub 10% (renormalised over available sources); sentiment — Reddit 65%, Hacker News 35%.

| Metric | Formula |
| --- | --- |
| Attention Score (0–100) | `100 · Φ(weighted mean z)` |
| Sentiment Score (−100…+100) | `100 · tanh(2.5 · weighted sentiment)` |
| Attention Acceleration | weighted acceleration, z-scored across the universe on the same day |
| Sentiment Change | weighted sentiment change, z-scored across the universe on the same day |
| Cross-Source Agreement (0–100) | `100 · [0.6 · (1 − min(1, SD(z)/2)) + 0.4 · (1 − min(1, |s_reddit − s_hn|/0.5))]`; attention-only if one text source; null with < 2 sources |
| Source Divergence (0–100) | `100 · max(clip((range z − 1.5)/4.5), clip((|Δs| − 0.15)/0.6))` |
| Data Confidence (0–100) | `100 · coverage^0.35 · sample^0.30 · freshness^0.15 · quality^0.20`; coverage = available / expected sources, sample = `1 − exp(−(text mentions + 8·numeric sources)/40)`, freshness = `exp(−max(0, oldest age − 2)/3)`, quality = `1 − min(0.9, 0.5·dup + bots + 0.5·ambiguity)` |
| Anomaly Score (0–100) | `100 · (1 − min(1, k · 2(1 − Φ(max|z|))))` over the k source z's and the sentiment-change z (Bonferroni) |
| Hype risk | high if Reddit z ≥ 3 and Reddit z − mean(other z) ≥ 2, or Reddit z ≥ 2 with bot share > 15%; elevated if Reddit z ≥ 2 and gap ≥ 1.25 |

A source is *expected* for a company if it has ever produced data for it (text sources: ever mentioned it).

## 6. Alternative Signal Score

Components `cᵢ ∈ [−1, 1]`, with `tone = tanh(4 · sentiment)`:

| Component | Default weight | Definition |
| --- | --- | --- |
| Abnormal attention | 25% | `tanh(max(0, z)/2) · tone` |
| Engagement-weighted sentiment | 30% | `tanh(2.5 · sentiment)` |
| Attention acceleration | 20% | `tanh(max(0, accel_cs)/2) · tone` |
| Sentiment acceleration | 10% | `tanh(sentChange_cs/2)` |
| Cross-source confirmation | 10% | `tone · (n sources with z > 0.5)/(n sources)` when at least two are elevated, else 0 |
| Unusual-source bonus | 5% | `tanh(max(0, mean z of Wikipedia/search/GitHub)/2) · tone` |

`raw = Σ wᵢcᵢ`; `score = 50 + 50 · clip(raw · √(confidence/100) · (1 − penalties), −1, 1)`. Missing components contribute 0 and their weight is **not** redistributed (missing evidence should not be replaced by other evidence at full strength). No sources → null score, confidence 0.

**Why the weights differ from the 30/25/20/10/10/5 starting point.** Attention has no direction, so it is multiplied by tone; quiet periods are not treated as bearish (`max(0, z)`). With abnormal attention at 30% the ranking was dominated by loud names with mild tone, so attention went to 25% and sentiment to 30%. Weights are configurable per run in the Lab; they were not fitted to returns.

**Penalties** shrink toward 50 (summed, capped at 80%): fewer than 15 text mentions in 7 days 30%; duplicate share > 30% 20%; one source available or > 80% of attention weight 15%; freshness factor < 0.6 15%; ambiguous-match share > 30% 10%; bot share > 15% 20%; one source at z ≥ 3 while all others < 1 20%.

**Anomaly events** are logged when a source's z first crosses ±3.5, week-over-week sentiment change crosses ±3.5σ, hype risk turns high, divergence crosses 85, or product sentiment falls 0.6 below investment sentiment; the same ticker/source/kind is not repeated within 7 days.

**Update frequency**: daily (UTC). `npm run refresh` re-ingests the last N days and recomputes all features, so late-arriving data revises recent days only.

## 7. Differentiated signals

| Signal | Why it might carry information | Expected failure modes | Why it is not repackaged momentum |
| --- | --- | --- | --- |
| Wikipedia attention shock | Broad, non-trader curiosity from news, launches, executive changes | Article renames, residual bots, irrelevant newsworthiness | Page views only; it may *follow* price moves, which the Lab measures rather than assumes |
| Product − investment sentiment | Customers/developers often notice product problems before investors talk about them | Thin aspect samples, aspect misclassification | Compares two kinds of talk; no price input |
| Developer-activity acceleration | Open-source engagement as an ecosystem proxy | ~35–45% coverage, release bursts, OSS ≠ R&D | Counts public GitHub events |
| Retail-attention crowding | Reddit outrunning every other source points to a retail-specific narrative | Retail-first real news, Reddit outages | Gap between attention z-scores |
| Community breadth | Discussion across many independent communities is hard to fake | Cross-posting (removed first) | Dispersion of where text appears |

## 8. Signal Lab

- Eligible universe: all / top 50 / top 25 by cap, optional sectors, minimum confidence. Rebalance dates are weekdays from the end of the 37-day warm-up.
- One feature is used raw; several are combined as a weighted sum of same-day cross-sectional z-scores. Composite weights and excluded sources recompute the composite from stored point-in-time features.
- Per date (≥ 20 names): Pearson IC, Spearman rank IC, quintiles by rank, Q5−Q1 spread, hit rate (signal and return on the same side of their medians), top/bottom membership.
- Means use every date; t-statistics, normal CIs, block-bootstrap CIs (block 3, 1,000 resamples, fixed seed), spread curves, drawdowns and turnover use **non-overlapping** rebalances (every h-th date).
- Chronological 60/20/20 calibration / validation / test split; the verdict is based on the held-out test: "Showed … rank correlation" only if the test t ≥ 2 in absolute value with the same sign as the full sample, otherwise "Did not demonstrate stable out-of-sample performance".
- Expanding-window walk-forward (4 folds): sign (and best feature if several) chosen on earlier dates only.
- Baselines: seeded random signal, Attention Score only, default composite. Breakdowns by sector (within-sector IC, ≥ 6 names), month, and mood regime. Sensitivity to minimum confidence and to removing each source.
- Integrity checks on every run: every label enters after its signal date; no feature row uses an observation dated after its date.

### What the demo data contains

Synthetic prices follow `r = β·market + ε + κ·σ·Δtone(t−2) + event drift`, where `Δtone` is the 5-day change in a company's latent investment tone and κ = 0.35 (`ALTSIGNAL_PLANTED_COUPLING`). Because only the first day or two after a signal date carry this link, the Lab recovers it for *Sentiment Change* at the 1-day horizon (rank IC ≈ 0.03, held-out t ≈ 3.1 in the shipped seed) but not at 5 days, while the default composite shows a strong in-sample *negative* association at 5 days (t ≈ −5.7) that vanishes in the held-out period (t ≈ 0.5) — a worked example of why the test split matters. Both outcomes are artefacts of the generator, not facts about markets.

## 9. Research integrity checklist

| Safeguard | Where |
| --- | --- |
| Point-in-time universe | dated snapshot; limitation: one snapshot applied to all history (survivorship) |
| No future data in features | windowed on dates ≤ t; unit test mutates the future and checks features at t are unchanged; Lab re-verifies |
| Timezones | UTC days throughout; labels start the next trading close |
| Publication and collection timestamps | stored on every document and metric row |
| Correct label shift | `labels.ts` + unit tests (weekends, last-price boundary) |
| Missing ≠ zero | explicit zero rows only for collected days; gaps logged as data-quality events |
| Multiple testing, survivorship, costs, coverage change | warnings attached to every Lab result |
| Model versions | `model_versions`, `sentiment_results.model_version_id`, `daily_company_signals.model_version` |
