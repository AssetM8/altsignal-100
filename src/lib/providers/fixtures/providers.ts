import type { SourceId } from "@/config/signal";
import { describe } from "../descriptors";
import type {
  AlternativeDataProvider,
  CompanyEntity,
  FetchRequest,
  NumericObservation,
  ProviderBatch,
  ProviderDescriptor,
  ProviderStatus,
  RawDocument,
} from "../types";
import { Rng, hashString } from "../../util/rng";
import { dateRange } from "../../util/dates";
import { NOISE, NON_ENGLISH, composePost, fill, pickAspect, pickCommunity } from "./text";
import { weekdayFactor, type World } from "./world";

/**
 * Fixture providers return the exact same normalised schema as the live
 * adapters, flagged `isSynthetic: true`. Generation is keyed on
 * (source, ticker, date) so any date range reproduces identical items.
 */

const FIXTURE_HOST = "https://demo.altsignal.invalid";

function clampRange(world: World, source: string, req: FetchRequest): string[] {
  const latest = world.latestDate[source] ?? req.end;
  return dateRange(req.start, req.end).filter((d) => d <= latest && !world.outages[source]?.has(d) && world.dates.includes(d));
}

abstract class FixtureBase implements AlternativeDataProvider {
  readonly descriptor: ProviderDescriptor;
  constructor(protected readonly world: World, id: SourceId) {
    this.descriptor = describe(id, "fixture");
  }
  status(): ProviderStatus {
    return { state: "demo", reason: "Deterministic synthetic fixture (demo mode)" };
  }
  abstract fetch(req: FetchRequest): Promise<ProviderBatch>;
}

export class FixtureTextProvider extends FixtureBase {
  constructor(world: World, private readonly source: "reddit" | "hackernews") {
    super(world, source);
  }

  async fetch(req: FetchRequest): Promise<ProviderBatch> {
    const docs: RawDocument[] = [];
    const days = clampRange(this.world, this.source, req);
    for (const date of days) {
      for (const e of req.companies) docs.push(...this.companyDay(e, date));
      docs.push(...this.noiseDay(req.companies, date));
    }
    docs.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    return {
      sourceId: this.source,
      documents: docs,
      observations: [],
      fetchedAt: new Date().toISOString(),
      coveredDates: days,
      quality: { requested: days.length * req.companies.length, received: docs.length, errors: [] },
    };
  }

  private companyDay(e: CompanyEntity, date: string): RawDocument[] {
    const cw = this.world.companies.get(e.ticker);
    const day = cw?.days.get(date);
    if (!cw || !day) return [];
    const rng = new Rng(hashString(`${this.source}:${e.ticker}:${date}`));
    const base = this.source === "reddit" ? cw.base.reddit : cw.base.hackernews;
    const lambda = base * Math.exp(day.attention + (day.idio[this.source] ?? 0) + (day.sourceAttention[this.source] ?? 0)) * weekdayFactor(this.source, date);
    const n = rng.poisson(lambda);
    const out: RawDocument[] = [];
    const authorsPool = Math.max(8, Math.round(lambda * 25));
    for (let i = 0; i < n; i++) {
      const aspect = pickAspect(rng, this.source);
      const override = day.sourceToneOverride[this.source];
      const tone =
        override ?? (aspect === "investment" ? day.toneInvestment : aspect === "product" ? day.toneProduct : day.toneReputation);
      const post = composePost(e, rng, aspect, tone + 0.15 * rng.normal(), this.source);
      const community = this.source === "reddit" ? pickCommunity(rng, e, aspect) : "hackernews";
      out.push(this.doc(e.ticker, date, i, rng, community, `u${rng.int(0, authorsPool)}:${e.ticker}`, post.title, post.body, lambda));
    }
    // Bot-like repetition during hype events: a few accounts posting near-identical text.
    if (this.source === "reddit" && day.botShare > 0 && n > 0) {
      const extra = Math.round((n * day.botShare) / (1 - day.botShare));
      const template = `${e.cashtag} is going to explode, buy now before it's too late 🚀🚀🚀`;
      for (let i = 0; i < extra; i++) {
        const variant = i % 3 === 0 ? template : `${template}${"!".repeat(1 + (i % 4))}`;
        out.push(this.doc(e.ticker, date, n + i, rng, rng.pick(["wallstreetbets", "StockMarket", "pennystocks"]), `bot${i % 3}:${e.ticker}`, variant, "", lambda * 0.2));
      }
    }
    // Occasional cross-post of the first item into another community (same external URL).
    if (this.source === "reddit" && out.length && rng.chance(0.06)) {
      const first = out[0] as RawDocument;
      out.push({ ...first, externalId: `${first.externalId}-xp`, community: "investing", authorHash: first.authorHash, url: `${FIXTURE_HOST}/link/${e.ticker}/${date}` });
      out[0] = { ...first, url: `${FIXTURE_HOST}/link/${e.ticker}/${date}` };
    }
    // Rare non-English item about the company (should be dropped by language filter).
    if (rng.chance(0.015)) {
      const name = e.shortNames[0] ?? e.officialName;
      out.push(this.doc(e.ticker, date, 900, rng, "international", `intl:${e.ticker}`, fill(rng.pick(NON_ENGLISH), { co: name, tag: e.cashtag, prod: name }), "", 1));
    }
    return out;
  }

  private noiseDay(companies: CompanyEntity[], date: string): RawDocument[] {
    const rng = new Rng(hashString(`${this.source}:noise:${date}`));
    const n = rng.poisson(this.source === "reddit" ? 6 : 2) * (companies.length >= 50 ? 1 : 0);
    return Array.from({ length: n }, (_, i) => this.doc("noise", date, i, rng, "offtopic", `n${rng.int(0, 400)}`, rng.pick(NOISE), "", 3)).map((d) => ({ ...d, community: this.source === "reddit" ? "AskReddit" : "hackernews" }));
  }

  private doc(key: string, date: string, i: number, rng: Rng, community: string, author: string, title: string, body: string, lambda: number): RawDocument {
    const secs = rng.int(0, 86_399);
    const published = new Date(Date.parse(`${date}T00:00:00Z`) + secs * 1000).toISOString();
    const score = Math.max(0, Math.round(Math.exp(1.2 + 0.9 * rng.normal() + 0.25 * Math.log1p(lambda))));
    const externalId = `demo-${this.source}-${key}-${date}-${i}`;
    return {
      sourceId: this.source,
      externalId,
      url: this.source === "reddit" ? `${FIXTURE_HOST}/reddit/r/${community}/${externalId}` : `${FIXTURE_HOST}/hn/item/${externalId}`,
      community,
      authorHash: `h${hashString(`salt:${author}`).toString(16)}`,
      title,
      body,
      publishedAt: published,
      collectedAt: published,
      engagement: { score, comments: Math.round(score * (0.2 + 0.4 * rng.uniform())) },
      isSynthetic: true,
    };
  }
}

export class FixtureNumericProvider extends FixtureBase {
  constructor(world: World, private readonly source: "wikipedia" | "search" | "github") {
    super(world, source);
  }

  async fetch(req: FetchRequest): Promise<ProviderBatch> {
    const obs: NumericObservation[] = [];
    const days = clampRange(this.world, this.source, req);
    let requested = 0;
    for (const e of req.companies) {
      const cw = this.world.companies.get(e.ticker);
      if (!cw) continue;
      const base = cw.base[this.source];
      if (base === null || (this.source === "wikipedia" && !e.wikipediaTitle) || (this.source === "github" && !e.githubOrgs.length)) continue;
      for (const date of days) {
        requested++;
        const day = cw.days.get(date);
        if (!day) continue;
        const rng = new Rng(hashString(`${this.source}:${e.ticker}:${date}`));
        if (this.source === "wikipedia" && rng.chance(0.01)) continue; // sporadic API gaps
        const shock = (day.sourceAttention[this.source] ?? 0) + (day.idio[this.source] ?? 0);
        let value: number;
        if (this.source === "wikipedia") {
          value = Math.round(base * Math.exp(0.8 * day.attention + shock + 0.12 * rng.normal()) * weekdayFactor("wikipedia", date));
        } else if (this.source === "search") {
          value = Math.min(100, Math.max(0, Math.round(base * Math.exp(0.6 * day.attention + shock + 0.1 * rng.normal()) * weekdayFactor("search", date))));
        } else {
          value = rng.poisson(base * Math.exp(0.3 * day.attention + shock) * weekdayFactor("github", date));
        }
        obs.push({
          sourceId: this.source,
          ticker: e.ticker,
          date,
          value,
          collectedAt: `${date}T23:30:00.000Z`,
          isSynthetic: true,
          meta: this.source === "wikipedia" ? { article: e.wikipediaTitle ?? "" } : this.source === "github" ? { orgs: e.githubOrgs.join(",") } : { term: e.searchTerm },
        });
      }
    }
    return {
      sourceId: this.source,
      documents: [],
      observations: obs,
      fetchedAt: new Date().toISOString(),
      coveredDates: days,
      quality: { requested, received: obs.length, errors: [] },
    };
  }
}
