import { describe, expect, it } from "vitest";
import { Deduplicator, hamming, simhash } from "@/lib/nlp/dedupe";
import { canonicalUrl, cleanText } from "@/lib/nlp/clean";
import { detectLanguage } from "@/lib/nlp/lang";
import { aggregateTextMetrics, processDocuments, engagementWeight } from "@/lib/pipeline/process-text";
import { defaultClassifier } from "@/lib/nlp/sentiment";
import type { RawDocument } from "@/lib/providers/types";
import { getResolver } from "../helpers";

const doc = (o: Partial<RawDocument> & { externalId: string; title: string }): RawDocument => ({
  sourceId: "reddit", url: null, community: "stocks", authorHash: "a1", body: "", publishedAt: "2026-09-01T12:00:00.000Z",
  collectedAt: "2026-09-01T12:00:00.000Z", engagement: { score: 10, comments: 2 }, isSynthetic: true, ...o,
});

describe("cleaning, language and dedupe", () => {
  it("strips markup and control characters", () => {
    expect(cleanText("<p>Hi&amp;bye<script>x()</script>​ there</p>")).toBe("Hi&bye there");
  });
  it("canonicalises URLs for duplicate detection", () => {
    expect(canonicalUrl("https://www.Example.com/a/?utm_source=x&id=2#frag")).toBe("example.com/a?id=2");
  });
  it("detects non-English text", () => {
    expect(detectLanguage("Las acciones de la empresa suben hoy con buenos resultados para los inversores").lang).toBe("other");
    expect(detectLanguage("The company reported strong results and the stock is up").lang).toBe("en");
  });
  it("flags cross-posts, near-duplicates and bot-like repetition", () => {
    const d = new Deduplicator();
    expect(d.check({ key: "1", url: "https://x.com/story", community: "a", authorHash: "u1", text: "Original story about chips and the market today" }).status).toBe("unique");
    expect(d.check({ key: "2", url: "https://x.com/story?utm_source=r", community: "b", authorHash: "u2", text: "different" }).status).toBe("crosspost");
    const base = "This stock is going to explode buy now before it is too late friends";
    expect(d.check({ key: "3", url: null, community: "a", authorHash: "bot", text: base }).status).toBe("unique");
    expect(d.check({ key: "4", url: null, community: "a", authorHash: "bot", text: `${base}!!` }).status).toBe("duplicate_exact");
    expect(d.check({ key: "5", url: null, community: "a", authorHash: "bot", text: `${base}!!!` }).status).toBe("bot_repeat");
  });
  it("simhash is stable and close for near-identical text", () => {
    const a = simhash("Nvidia shares rally after the product launch event today");
    const b = simhash("Nvidia shares rally after the product launch event today!");
    expect(hamming(a, b)).toBeLessThanOrEqual(3);
  });
});

describe("aggregation", () => {
  it("counts only unique, relevant, English items and keeps explicit zeros vs missing days", async () => {
    const r = await getResolver();
    const docs = [
      doc({ externalId: "1", title: "Microsoft stock looks strong, bullish", authorHash: "a" }),
      doc({ externalId: "2", title: "Microsoft stock looks strong, bullish", authorHash: "b" }), // exact duplicate
      doc({ externalId: "3", title: "Las acciones de Microsoft suben hoy con la empresa", authorHash: "c" }), // non-English
      doc({ externalId: "4", title: "Microsoft Azure outage again, terrible", authorHash: "d", engagement: { score: 500, comments: 200 } }),
    ];
    const processed = processDocuments(docs, r, defaultClassifier);
    const m = aggregateTextMetrics(processed, ["MSFT", "AAPL"], ["2026-09-01", "2026-09-02"]);
    const msft = m.get("MSFT") ?? [];
    expect(msft).toHaveLength(2); // one row per collected day
    expect(msft[0]?.mentionCount).toBe(2);
    expect(msft[0]?.uniqueAuthors).toBe(2);
    expect(msft[0]?.dupRatio).toBeCloseTo(1 / 3, 3);
    expect(msft[1]).toMatchObject({ date: "2026-09-02", mentionCount: 0 }); // collected, nothing said
    expect(msft[0]?.investmentSentiment).toBeGreaterThan(0);
    expect(msft[0]?.productSentiment).toBeLessThan(0);
    // An uncollected day produces no row at all (missing, not zero).
    expect(aggregateTextMetrics(processed, ["MSFT"], ["2026-09-02"]).get("MSFT")?.map((x) => x.date)).toEqual(["2026-09-02"]);
  });
  it("weights engagement sub-linearly", () => {
    expect(engagementWeight(1, 1000, 0)).toBeLessThan(10 * engagementWeight(1, 10, 0));
    expect(engagementWeight(0.5, 10, 2)).toBeCloseTo(engagementWeight(1, 10, 2) / 2, 6);
  });
});
