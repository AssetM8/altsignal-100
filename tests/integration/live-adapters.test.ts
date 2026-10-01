/** Live adapters against recorded response shapes (no network). */
import { describe, expect, it } from "vitest";
import { WikipediaPageviewsProvider } from "@/lib/providers/live/wikipedia";
import { HackerNewsProvider } from "@/lib/providers/live/hackernews";
import { RedditProvider } from "@/lib/providers/live/reddit";
import { GitHubActivityProvider } from "@/lib/providers/live/github";
import { selectUniverse } from "@/lib/providers/live/fmp-universe";
import { createProviders } from "@/lib/providers/registry";
import { RawDocumentSchema, NumericObservationSchema } from "@/lib/providers/types";
import { buildEntity } from "@/lib/providers/universe";

const nvda = buildEntity({ rank: 1, ticker: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", sector: "Information Technology", industry: "Semis", marketCapUsd: 4e12, securityType: "common", shareClass: null, previousIdentifiers: [] });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("live adapters share the normalised schema", () => {
  it("Wikipedia pageviews", async () => {
    const calls: string[] = [];
    const p = new WikipediaPageviewsProvider("test-agent", async (url) => {
      calls.push(url);
      return ok({ items: [{ article: "Nvidia", timestamp: "2026092900", views: 12345 }, { article: "Nvidia", timestamp: "2026093000", views: 23456 }] });
    });
    const b = await p.fetch({ companies: [nvda], start: "2026-09-29", end: "2026-09-30" });
    expect(calls[0]).toContain("/per-article/en.wikipedia/all-access/user/Nvidia/daily/2026092900/2026093000");
    expect(b.observations).toHaveLength(2);
    b.observations.forEach((o) => NumericObservationSchema.parse(o));
    expect(b.observations[0]).toMatchObject({ ticker: "NVDA", date: "2026-09-29", value: 12345, isSynthetic: false });
  });

  it("Hacker News (Algolia) hashes authors and never stores handles", async () => {
    const p = new HackerNewsProvider(async () => ok({ nbPages: 1, hits: [{ objectID: "1", created_at_i: 1790000000, title: "Nvidia ships new GPU", author: "pg", points: 120, num_comments: 40 }] }), 1);
    const b = await p.fetch({ companies: [nvda], start: "2026-09-29", end: "2026-09-30" });
    const d = RawDocumentSchema.parse(b.documents[0]);
    expect(d.authorHash).toMatch(/^h[0-9a-f]{16}$/);
    expect(JSON.stringify(b)).not.toContain('"pg"');
    expect(d.url).toBe("https://news.ycombinator.com/item?id=1");
  });

  it("Reddit is unavailable without credentials and does not call the network", async () => {
    let called = false;
    const p = new RedditProvider({ clientId: "", clientSecret: "", userAgent: "x" }, async () => { called = true; return ok({}); });
    expect(p.status().state).toBe("unavailable");
    const b = await p.fetch({ companies: [nvda], start: "2026-09-29", end: "2026-09-30" });
    expect(b.documents).toHaveLength(0);
    expect(called).toBe(false);
  });

  it("Reddit with credentials authenticates and normalises posts", async () => {
    const ts = Date.parse("2026-09-30T10:00:00Z") / 1000;
    const p = new RedditProvider({ clientId: "id", clientSecret: "secret", userAgent: "ua" }, async (url) => {
      if (url.includes("access_token")) return ok({ access_token: "tok", expires_in: 3600 });
      return ok({ data: { after: null, children: [{ data: { id: "a", name: "t3_a", subreddit: "stocks", author: "someone", title: "$NVDA earnings", selftext: "", url: "", permalink: "/r/stocks/comments/a/x/", created_utc: ts, score: 5, num_comments: 1, over_18: false } }] } });
    });
    (p as unknown as { throttle: { wait: () => Promise<void> } }).throttle = { wait: async () => {} };
    const b = await p.fetch({ companies: [nvda], start: "2026-09-30", end: "2026-09-30" });
    expect(b.documents.length).toBeGreaterThan(0);
    expect(b.documents[0]?.authorHash).not.toContain("someone");
  });

  it("GitHub org events become daily counts", async () => {
    const p = new GitHubActivityProvider("", async () => ok([{ type: "PushEvent", created_at: "2026-09-30T01:00:00Z" }, { type: "IssuesEvent", created_at: "2026-09-30T02:00:00Z" }, { type: "PushEvent", created_at: "2026-09-29T02:00:00Z" }]));
    (p as unknown as { throttle: { wait: () => Promise<void> } }).throttle = { wait: async () => {} };
    const b = await p.fetch({ companies: [nvda], start: "2026-09-29", end: "2026-09-30" });
    expect(b.observations.find((o) => o.date === "2026-09-30")?.value).toBe(2);
  });

  it("FMP universe selection excludes ETFs, warrants, foreign and duplicate share classes", () => {
    const row = (symbol: string, companyName: string, marketCap: number, extra: Record<string, unknown> = {}) => ({ symbol, companyName, marketCap, sector: "Tech", industry: "x", exchangeShortName: "NASDAQ", country: "US", isEtf: false, isFund: false, isActivelyTrading: true, ...extra });
    const rows = [
      row("GOOGL", "Alphabet Inc. Class A", 3e12), row("GOOG", "Alphabet Inc. Class C", 3e12), row("SPY", "SPDR S&P 500", 6e11, { isEtf: true }),
      row("TSM", "Taiwan Semiconductor", 1e12, { country: "TW" }), row("XYZW", "Something Acquisition Corp", 1e11), row("ABC-WS", "ABC Warrant", 1e11),
      ...Array.from({ length: 100 }, (_, i) => row(`C${i}`, `Company ${i} Inc.`, 1e11 - i * 1e8)),
    ];
    const snap = selectUniverse(rows, "2026-10-01");
    const tickers = snap.companies.map((c) => c.ticker);
    expect(tickers).toContain("GOOGL");
    expect(tickers).not.toContain("GOOG");
    expect(tickers).not.toContain("SPY");
    expect(tickers).not.toContain("TSM");
    expect(tickers).not.toContain("XYZW");
    expect(snap.companies).toHaveLength(100);
  });

  it("live mode wires live adapters and marks search unavailable", () => {
    const env = { ALTSIGNAL_MODE: "live" as const, DATABASE_URL: "", ALTSIGNAL_DISABLED_PROVIDERS: ["github"], ADMIN_TOKEN: "", ALTSIGNAL_CONTACT: "x", REDDIT_CLIENT_ID: "", REDDIT_CLIENT_SECRET: "", GITHUB_TOKEN: "", FMP_API_KEY: "" };
    const ps = createProviders([nvda], new Map(), env);
    expect(ps.alt.wikipedia.descriptor.implementation).toBe("live");
    expect(ps.alt.search.status().state).toBe("unavailable");
    expect(ps.alt.reddit.status().state).toBe("unavailable");
    expect(ps.alt.github.status()).toMatchObject({ state: "unavailable", reason: expect.stringContaining("Disabled") });
    expect(ps.market).toBeNull();
  });
});
