import { describe } from "../descriptors";
import type { AlternativeDataProvider, FetchRequest, NumericObservation, ProviderBatch, ProviderStatus } from "../types";
import { Throttle, getJson, type FetchLike } from "./http";

interface GhEvent {
  type: string;
  created_at: string;
}

/**
 * Live adapter: public events of mapped GitHub organisations.
 * The public events endpoint covers ~90 days / 300 events per org, so this
 * is a recent-activity proxy rather than a long history.
 */
export class GitHubActivityProvider implements AlternativeDataProvider {
  readonly descriptor = describe("github", "live");
  private readonly throttle: Throttle;
  constructor(private readonly token: string, private readonly fetchImpl: FetchLike = fetch) {
    this.throttle = new Throttle(token ? 250 : 1500);
  }

  status(): ProviderStatus {
    return { state: "live", reason: this.token ? null : "No GITHUB_TOKEN: limited to 60 requests/hour" };
  }

  async fetch(req: FetchRequest): Promise<ProviderBatch> {
    const collectedAt = new Date().toISOString();
    const observations: NumericObservation[] = [];
    const errors: string[] = [];
    let requested = 0;
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "altsignal-100" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    for (const c of req.companies) {
      if (!c.githubOrgs.length) continue;
      const counts = new Map<string, number>();
      for (const org of c.githubOrgs) {
        for (let page = 1; page <= 3; page++) {
          requested++;
          await this.throttle.wait();
          try {
            const events = await getJson<GhEvent[]>(this.fetchImpl, `https://api.github.com/orgs/${encodeURIComponent(org)}/events?per_page=100&page=${page}`, headers);
            for (const ev of events) {
              const d = ev.created_at.slice(0, 10);
              if (d >= req.start && d <= req.end) counts.set(d, (counts.get(d) ?? 0) + 1);
            }
            if (events.length < 100) break;
          } catch (e) {
            errors.push(`${c.ticker}/${org}: ${(e as Error).message}`);
            break;
          }
        }
      }
      for (const [date, value] of counts) {
        observations.push({ sourceId: "github", ticker: c.ticker, date, value, collectedAt, isSynthetic: false, meta: { orgs: c.githubOrgs.join(",") } });
      }
    }
    return { sourceId: "github", documents: [], observations, fetchedAt: collectedAt, quality: { requested, received: observations.length, errors } };
  }
}
