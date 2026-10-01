import { SOURCE_IDS, type SourceId } from "@/config/signal";
import { getEnv, type ServerEnv } from "@/config/env";
import { describe } from "./descriptors";
import type { AlternativeDataProvider, CompanyEntity, FetchRequest, MarketDataProvider, ProviderBatch, ProviderStatus } from "./types";
import { FixtureNumericProvider, FixtureTextProvider } from "./fixtures/providers";
import { FixtureMarketDataProvider } from "./fixtures/prices";
import { buildWorld } from "./fixtures/world";
import { WikipediaPageviewsProvider } from "./live/wikipedia";
import { HackerNewsProvider } from "./live/hackernews";
import { RedditProvider } from "./live/reddit";
import { GitHubActivityProvider } from "./live/github";

/** A provider that is switched off (missing credentials, disabled by config, or not implemented). */
export class UnavailableProvider implements AlternativeDataProvider {
  readonly descriptor;
  constructor(id: SourceId, private readonly reason: string, implementation: "live" | "fixture" = "live") {
    this.descriptor = describe(id, implementation);
  }
  status(): ProviderStatus {
    return { state: "unavailable", reason: this.reason };
  }
  async fetch(_req: FetchRequest): Promise<ProviderBatch> {
    return { sourceId: this.descriptor.id, documents: [], observations: [], fetchedAt: new Date().toISOString(), quality: { requested: 0, received: 0, errors: [this.reason] } };
  }
}

export interface ProviderSet {
  mode: ServerEnv["ALTSIGNAL_MODE"];
  alt: Record<SourceId, AlternativeDataProvider>;
  market: MarketDataProvider | null;
}

export function createProviders(entities: CompanyEntity[], marketCaps: Map<string, number>, env: ServerEnv = getEnv()): ProviderSet {
  const disabled = new Set(env.ALTSIGNAL_DISABLED_PROVIDERS);
  const alt = {} as Record<SourceId, AlternativeDataProvider>;
  let market: MarketDataProvider | null = null;

  if (env.ALTSIGNAL_MODE === "demo") {
    const world = buildWorld(entities, marketCaps);
    alt.reddit = new FixtureTextProvider(world, "reddit");
    alt.hackernews = new FixtureTextProvider(world, "hackernews");
    alt.wikipedia = new FixtureNumericProvider(world, "wikipedia");
    alt.search = new FixtureNumericProvider(world, "search");
    alt.github = new FixtureNumericProvider(world, "github");
    market = new FixtureMarketDataProvider(world);
  } else {
    alt.reddit = new RedditProvider({ clientId: env.REDDIT_CLIENT_ID, clientSecret: env.REDDIT_CLIENT_SECRET, userAgent: env.ALTSIGNAL_CONTACT });
    alt.hackernews = new HackerNewsProvider();
    alt.wikipedia = new WikipediaPageviewsProvider(env.ALTSIGNAL_CONTACT);
    alt.search = new UnavailableProvider("search", "No licensed search-interest provider configured (planned adapter)");
    alt.github = new GitHubActivityProvider(env.GITHUB_TOKEN);
    market = null; // requires a licensed price provider; Signal Lab reports no outcome labels
  }
  for (const id of SOURCE_IDS) {
    if (disabled.has(id)) alt[id] = new UnavailableProvider(id, "Disabled by ALTSIGNAL_DISABLED_PROVIDERS", alt[id].descriptor.implementation);
  }
  return { mode: env.ALTSIGNAL_MODE, alt, market };
}
