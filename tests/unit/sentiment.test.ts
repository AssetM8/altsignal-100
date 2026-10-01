import { describe, expect, it } from "vitest";
import { LexiconClassifier } from "@/lib/nlp/sentiment";

const c = new LexiconClassifier();

describe("sentiment classifier", () => {
  it("separates product praise from an investment view", () => {
    const r = c.classify("Love my new iPhone, the battery is amazing");
    expect(r.label).toBe("positive");
    expect(r.aspect).toBe("product");
    expect(r.direction).toBeNull(); // product positivity is NOT bullish
  });

  it("assigns direction only to investment-aspect items", () => {
    const bull = c.classify("Bought more shares, very bullish into earnings 🚀");
    expect(bull.aspect).toBe("investment");
    expect(bull.direction).toBe("bullish");
    const bear = c.classify("Sold my shares, this stock is overvalued and tanking");
    expect(bear.direction).toBe("bearish");
  });

  it("handles negation", () => {
    expect(c.classify("The quarter was good").score).toBeGreaterThan(0);
    expect(c.classify("The quarter was not good").score).toBeLessThan(0);
    expect(c.classify("Not bullish on this stock").label).toBe("negative");
  });

  it("flags sarcasm and lowers confidence", () => {
    const r = c.classify("Yeah right, quality is totally fine /s");
    expect(r.label).toBe("sarcastic");
    expect(r.flags.sarcasm).toBe(true);
    expect(r.score).toBeLessThanOrEqual(0);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("marks questions with hedging as uncertain", () => {
    const r = c.classify("Maybe buy the stock? idk, thoughts?");
    expect(r.label).toBe("uncertain");
  });

  it("windows long texts around the mention", () => {
    const filler = " the and of to in".repeat(30);
    const text = `Terrible awful disaster for the other firm.${filler} Microsoft looks great and strong.`;
    const pos = text.indexOf("Microsoft");
    expect(c.classify(text, [pos]).score).toBeGreaterThan(0);
  });

  it("reports model identity for version tracking", () => {
    expect(c.info).toMatchObject({ name: "altsignal-lexicon", version: "1.0.0" });
  });
});
