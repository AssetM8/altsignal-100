import { describe } from "../descriptors";
import type { AlternativeDataProvider, FetchRequest, ProviderBatch, ProviderStatus, RawDocument } from "../types";
import { Throttle, getJson, hashAuthor, type FetchLike } from "./http";

interface AlgoliaHit {
  objectID: string;
  created_at_i: number;
  title?: string | null;
  story_title?: string | null;
  comment_text?: string | null;
  story_text?: string | null;
  url?: string | null;
  author?: string | null;
  points?: number | null;
  num_comments?: number | null;
}
interface AlgoliaResponse {
  hits: AlgoliaHit[];
  nbPages: number;
}

/** Live adapter: Hacker News via the public Algolia search API (no key). */
export class HackerNewsProvider implements AlternativeDataProvider {
  readonly descriptor = describe("hackernews", "live");
  private readonly throttle = new Throttle(500);
  constructor(private readonly fetchImpl: FetchLike = fetch, private readonly maxPages = 2) {}

  status(): ProviderStatus {
    return { state: "live", reason: null };
  }

  static url(query: string, startTs: number, endTs: number, page: number): string {
    const q = encodeURIComponent(`"${query}"`);
    return `https://hn.algolia.com/api/v1/search_by_date?query=${q}&tags=(story,comment)&numericFilters=created_at_i>=${startTs},created_at_i<${endTs}&hitsPerPage=100&page=${page}`;
  }

  async fetch(req: FetchRequest): Promise<ProviderBatch> {
    const startTs = Math.floor(Date.parse(`${req.start}T00:00:00Z`) / 1000);
    const endTs = Math.floor(Date.parse(`${req.end}T00:00:00Z`) / 1000) + 86_400;
    const seen = new Set<string>();
    const documents: RawDocument[] = [];
    const errors: string[] = [];
    const collectedAt = new Date().toISOString();
    for (const c of req.companies) {
      // The query is only a recall step; the entity resolver decides relevance later.
      const query = c.shortNames[0] ?? c.officialName;
      for (let page = 0; page < this.maxPages; page++) {
        await this.throttle.wait();
        try {
          const data = await getJson<AlgoliaResponse>(this.fetchImpl, HackerNewsProvider.url(query, startTs, endTs, page), { Accept: "application/json" });
          for (const h of data.hits) {
            if (seen.has(h.objectID)) continue;
            seen.add(h.objectID);
            documents.push({
              sourceId: "hackernews",
              externalId: h.objectID,
              url: `https://news.ycombinator.com/item?id=${h.objectID}`,
              community: "hackernews",
              authorHash: hashAuthor("hackernews", h.author),
              title: h.title ?? h.story_title ?? "",
              body: h.comment_text ?? h.story_text ?? "",
              publishedAt: new Date(h.created_at_i * 1000).toISOString(),
              collectedAt,
              engagement: { score: h.points ?? 0, comments: h.num_comments ?? 0 },
              isSynthetic: false,
            });
          }
          if (page + 1 >= data.nbPages) break;
        } catch (e) {
          errors.push(`${c.ticker}: ${(e as Error).message}`);
          break;
        }
      }
    }
    return { sourceId: "hackernews", documents, observations: [], fetchedAt: collectedAt, quality: { requested: req.companies.length, received: documents.length, errors } };
  }
}
