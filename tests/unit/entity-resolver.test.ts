import { describe, expect, it } from "vitest";
import { getResolver, tickersOf } from "../helpers";
import { buildEntity, shortNameFromOfficial } from "@/lib/providers/universe";

describe("entity resolution", () => {
  it("matches cashtags, unambiguous tickers and names with recorded reasons", async () => {
    const r = await getResolver();
    const res = r.resolve("", "Loading $NVDA calls; also like MSFT and Salesforce here");
    expect(tickersOf(res)).toEqual(["CRM", "MSFT", "NVDA"]);
    const nvda = res.mentions.find((m) => m.ticker === "NVDA");
    expect(nvda?.bestReason).toBe("cashtag");
    expect(res.mentions.find((m) => m.ticker === "MSFT")?.bestReason).toBe("ticker");
    expect(res.mentions.find((m) => m.ticker === "CRM")?.bestReason).toBe("name");
  });

  it("is not a substring search", async () => {
    const r = await getResolver();
    // "Metallica", "Intelligence", "Oracleish" contain aliases as substrings but are different tokens.
    expect(tickersOf(r.resolve("", "Metallica artificial intelligence oracleish tunes"))).toEqual([]);
  });

  it("requires context for word-like tickers", async () => {
    const r = await getResolver();
    expect(tickersOf(r.resolve("", "NOW is the time to learn Rust"))).toEqual([]);
    expect(r.resolve("", "NOW is the time to learn Rust").rejected).toContainEqual({ ticker: "NOW", matchedText: "NOW", why: "no_context" });
    expect(tickersOf(r.resolve("", "Loaded up on T stock, the dividend is solid"))).toEqual(["T"]);
    expect(r.resolve("", "Loaded up on T stock").mentions[0]?.bestReason).toBe("ticker+context");
    expect(tickersOf(r.resolve("", "My CAT knocked over the plant again"))).toEqual([]);
  });

  it("ignores all-caps shouting for ambiguous tickers but keeps cashtags", async () => {
    const r = await getResolver();
    const shout = r.resolve("", "BUY NOW WHILE IT IS CHEAP, LIMITED OFFER ON SHOES TODAY ONLY");
    expect(tickersOf(shout)).toEqual([]);
    expect(shout.rejected.some((x) => x.why === "shouting")).toBe(true);
    expect(tickersOf(r.resolve("", "$NOW SHARES ARE RIPPING TODAY"))).toEqual(["NOW"]);
  });

  it("applies exclusion phrases and context rules to ambiguous names", async () => {
    const r = await getResolver();
    expect(tickersOf(r.resolve("", "Made an Apple pie, best apple recipe ever"))).toEqual([]);
    expect(tickersOf(r.resolve("", "I need my student visa approved before the trip"))).toEqual([]);
    expect(tickersOf(r.resolve("", "The Amazon rainforest documentary was great"))).toEqual([]);
    expect(tickersOf(r.resolve("", "Thinking about buying shares of Apple before the iPhone event"))).toEqual(["AAPL"]);
    expect(tickersOf(r.resolve("", "Visa and Mastercard both look strong into earnings"))).toEqual(["MA", "V"]);
  });

  it("resolves products, misspellings and previous tickers", async () => {
    const r = await getResolver();
    expect(r.resolve("", "Love my new iPhone, battery is amazing").mentions[0]).toMatchObject({ ticker: "AAPL", bestReason: "product" });
    expect(r.resolve("", "Nvida GPUs everywhere").mentions[0]).toMatchObject({ ticker: "NVDA", bestReason: "misspelling" });
    expect(r.resolve("", "Old FB holders are happy").mentions[0]).toMatchObject({ ticker: "META", bestReason: "previous_ticker" });
  });

  it("dilutes relevance when a post lists many companies", async () => {
    const r = await getResolver();
    const single = r.resolve("", "Microsoft earnings were strong").mentions[0]?.relevance ?? 0;
    const many = r.resolve("", "Microsoft, Nvidia, Netflix, Oracle stock, Boeing and Pfizer all reported").mentions.find((m) => m.ticker === "MSFT")?.relevance ?? 1;
    expect(many).toBeLessThan(single);
  });

  it("derives short names from official names", () => {
    expect(shortNameFromOfficial("The Goldman Sachs Group, Inc.")).toBe("Goldman Sachs");
    expect(shortNameFromOfficial("Exxon Mobil Corporation")).toBe("Exxon Mobil");
    const e = buildEntity({ rank: 1, ticker: "T", name: "AT&T Inc.", exchange: "NYSE", sector: "x", industry: "y", marketCapUsd: 1, securityType: "common", shareClass: null, previousIdentifiers: [] });
    expect(e.ambiguousTicker).toBe(true);
    expect(e.cashtag).toBe("$T");
  });
});
