import { describe } from "../descriptors";
import type { AlternativeDataProvider, FetchRequest, NumericObservation, ProviderBatch, ProviderStatus } from "../types";
import { Throttle, compactDate, getJson, type FetchLike } from "./http";

interface PageviewsResponse {
  items: { article: string; timestamp: string; views: number }[];
}

/** Live adapter: Wikimedia REST pageviews (no key). */
export class WikipediaPageviewsProvider implements AlternativeDataProvider {
  readonly descriptor = describe("wikipedia", "live");
  private readonly throttle = new Throttle(150);
  constructor(private readonly contact: string, private readonly fetchImpl: FetchLike = fetch) {}

  status(): ProviderStatus {
    return { state: "live", reason: null };
  }

  static url(title: string, start: string, end: string): string {
    return `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${title}/daily/${compactDate(start)}00/${compactDate(end)}00`;
  }

  async fetch(req: FetchRequest): Promise<ProviderBatch> {
    const observations: NumericObservation[] = [];
    const errors: string[] = [];
    let requested = 0;
    const collectedAt = new Date().toISOString();
    for (const c of req.companies) {
      if (!c.wikipediaTitle) continue;
      requested++;
      await this.throttle.wait();
      try {
        const data = await getJson<PageviewsResponse>(this.fetchImpl, WikipediaPageviewsProvider.url(c.wikipediaTitle, req.start, req.end), {
          "User-Agent": this.contact,
          Accept: "application/json",
        });
        for (const it of data.items ?? []) {
          const ts = it.timestamp; // YYYYMMDDHH
          const date = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
          observations.push({ sourceId: "wikipedia", ticker: c.ticker, date, value: it.views, collectedAt, isSynthetic: false, meta: { article: c.wikipediaTitle } });
        }
      } catch (e) {
        errors.push(`${c.ticker}: ${(e as Error).message}`);
      }
    }
    return { sourceId: "wikipedia", documents: [], observations, fetchedAt: collectedAt, quality: { requested, received: observations.length, errors } };
  }
}
