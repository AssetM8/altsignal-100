import { describe } from "../descriptors";
import type { AlternativeDataProvider, FetchRequest, ProviderBatch, ProviderStatus, RawDocument } from "../types";
import { Throttle, getJson, hashAuthor, type FetchLike } from "./http";

interface Listing {
  data: { children: { data: RedditPost }[]; after: string | null };
}
interface RedditPost {
  id: string;
  name: string;
  subreddit: string;
  author: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  created_utc: number;
  score: number;
  num_comments: number;
  over_18: boolean;
}

export const REDDIT_COMMUNITIES = ["stocks", "investing", "wallstreetbets", "StockMarket", "options", "technology", "hardware", "personalfinance"];

/**
 * Live adapter: Reddit Data API with OAuth app-only ("client credentials").
 * Disabled (status "unavailable") when REDDIT_CLIENT_ID/SECRET are missing.
 */
export class RedditProvider implements AlternativeDataProvider {
  readonly descriptor = describe("reddit", "live");
  private readonly throttle = new Throttle(700); // < 100 QPM
  private token: { value: string; expires: number } | null = null;
  constructor(
    private readonly creds: { clientId: string; clientSecret: string; userAgent: string },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  status(): ProviderStatus {
    if (!this.creds.clientId || !this.creds.clientSecret) return { state: "unavailable", reason: "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set" };
    return { state: "live", reason: null };
  }

  private async auth(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString("base64");
    const res = await this.fetchImpl("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": this.creds.userAgent },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`Reddit auth failed: HTTP ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  async fetch(req: FetchRequest): Promise<ProviderBatch> {
    const collectedAt = new Date().toISOString();
    if (this.status().state === "unavailable") {
      return { sourceId: "reddit", documents: [], observations: [], fetchedAt: collectedAt, quality: { requested: 0, received: 0, errors: ["credentials missing"] } };
    }
    const startTs = Date.parse(`${req.start}T00:00:00Z`) / 1000;
    const endTs = Date.parse(`${req.end}T00:00:00Z`) / 1000 + 86_400;
    const documents: RawDocument[] = [];
    const errors: string[] = [];
    const token = await this.auth();
    // Recall: newest posts per community; the entity resolver filters to the universe.
    for (const sub of REDDIT_COMMUNITIES) {
      let after: string | null = null;
      for (let page = 0; page < 10; page++) {
        await this.throttle.wait();
        try {
          const url = `https://oauth.reddit.com/r/${sub}/new?limit=100&raw_json=1${after ? `&after=${after}` : ""}`;
          const data: Listing = await getJson<Listing>(this.fetchImpl, url, { Authorization: `Bearer ${token}`, "User-Agent": this.creds.userAgent });
          let older = false;
          for (const { data: p } of data.data.children) {
            if (p.over_18) continue;
            if (p.created_utc < startTs) { older = true; continue; }
            if (p.created_utc >= endTs) continue;
            documents.push({
              sourceId: "reddit",
              externalId: p.name,
              url: `https://www.reddit.com${p.permalink}`,
              community: p.subreddit,
              authorHash: hashAuthor("reddit", p.author),
              title: p.title,
              body: p.selftext ?? "",
              publishedAt: new Date(p.created_utc * 1000).toISOString(),
              collectedAt,
              engagement: { score: p.score, comments: p.num_comments },
              isSynthetic: false,
            });
          }
          after = data.data.after;
          if (!after || older) break;
        } catch (e) {
          errors.push(`r/${sub}: ${(e as Error).message}`);
          break;
        }
      }
    }
    return { sourceId: "reddit", documents, observations: [], fetchedAt: collectedAt, quality: { requested: REDDIT_COMMUNITIES.length, received: documents.length, errors } };
  }
}
