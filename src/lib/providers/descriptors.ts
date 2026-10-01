import type { SourceId } from "@/config/signal";
import type { ProviderDescriptor } from "./types";

type Base = Omit<ProviderDescriptor, "implementation">;

/** Source metadata shared by the live adapter and its fixture twin. */
export const SOURCE_DESCRIPTORS: Record<SourceId, Base> = {
  reddit: {
    id: "reddit",
    name: "Reddit",
    kind: "text",
    description: "Posts and comments from investing, technology, product and sector communities, resolved to companies and scored for aspect-level sentiment.",
    supportedHistoryDays: 30,
    refreshFrequency: "Hourly (aggregated to UTC days)",
    rateLimit: { requests: 100, perSeconds: 60, notes: "OAuth app-only; free tier for non-commercial use. Respect Reddit Data API Terms." },
    license: "Reddit Data API Terms — non-commercial research use; commercial use requires an agreement. Store aggregates; delete removed content.",
    requiredEnv: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
    homepage: "https://www.reddit.com/dev/api",
    knownBiases: ["Skews to retail, younger, US-centric, male users", "Meme-stock communities over-represent a few tickers", "Sarcasm is common"],
  },
  hackernews: {
    id: "hackernews",
    name: "Hacker News",
    kind: "text",
    description: "Stories and comments from the Hacker News community via the public Algolia search API; strong signal for developer and product perception of tech companies.",
    supportedHistoryDays: null,
    refreshFrequency: "Hourly",
    rateLimit: { requests: 10_000, perSeconds: 3600, notes: "Algolia HN Search API, no key. Self-throttled to 2 req/s." },
    license: "Public API; content belongs to authors. Store previews and aggregates only.",
    requiredEnv: [],
    homepage: "https://hn.algolia.com/api",
    knownBiases: ["Heavily tech-sector; little coverage of staples, energy, utilities", "Developer/engineering viewpoint, not investors"],
  },
  wikipedia: {
    id: "wikipedia",
    name: "Wikipedia page views",
    kind: "numeric",
    description: "Daily user page views of each company's English Wikipedia article (Wikimedia REST pageviews API, agent=user).",
    supportedHistoryDays: null,
    refreshFrequency: "Daily (Wikimedia publishes the previous UTC day)",
    rateLimit: { requests: 100, perSeconds: 1, notes: "Wikimedia REST API; send a descriptive User-Agent with contact info." },
    license: "CC0 pageview data (Wikimedia Analytics).",
    requiredEnv: [],
    homepage: "https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews",
    knownBiases: ["English Wikipedia only", "Article renames/redirects can break series", "Some bot traffic remains despite agent=user"],
  },
  search: {
    id: "search",
    name: "Search interest",
    kind: "numeric",
    description: "Relative search interest for each company's primary search term (Google-Trends-style 0-100 index). Fixture-only in this build: there is no official Google Trends API.",
    supportedHistoryDays: null,
    refreshFrequency: "Daily",
    rateLimit: { requests: 0, perSeconds: 1, notes: "Requires a licensed provider (e.g. a SERP API vendor). Scraping Google is not permitted." },
    license: "Depends on the licensed provider chosen.",
    requiredEnv: ["(planned) SEARCH_PROVIDER_API_KEY"],
    homepage: "https://trends.google.com",
    knownBiases: ["Index is relative per term, not absolute volume", "Brand names collide with ordinary words"],
  },
  github: {
    id: "github",
    name: "GitHub developer activity",
    kind: "numeric",
    description: "Public developer activity (public events: pushes, PRs, issues, releases) in each company's mapped GitHub organisations — a developer-ecosystem activity proxy.",
    supportedHistoryDays: 90,
    refreshFrequency: "Daily",
    rateLimit: { requests: 60, perSeconds: 3600, notes: "Unauthenticated 60 req/h; 5,000 req/h with GITHUB_TOKEN." },
    license: "GitHub API Terms; public metadata only.",
    requiredEnv: ["(optional) GITHUB_TOKEN"],
    homepage: "https://docs.github.com/en/rest/activity/events",
    knownBiases: ["Only ~45% of the universe has a meaningful open-source footprint", "Org activity reflects OSS strategy, not overall R&D"],
  },
};

export function describe(id: SourceId, implementation: "live" | "fixture"): ProviderDescriptor {
  return { ...SOURCE_DESCRIPTORS[id], implementation };
}
