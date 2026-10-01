import { describe, expect, it } from "vitest";
import { computeForwardReturns, firstIndexAfter } from "@/lib/backtest/labels";
import { computeDateStat, nonOverlapping, splitDates, summarize, turnover, walkForward, type CrossSection } from "@/lib/backtest/engine";
import { Rng } from "@/lib/util/rng";
import type { PriceBar } from "@/lib/providers/types";

const bars = (ticker: string, closes: [string, number][]): PriceBar[] => closes.map(([date, close]) => ({ ticker, date, close, isSynthetic: true }));

describe("forward-return alignment", () => {
  // Thu 2026-09-24 … Wed 2026-09-30 (no weekend bars)
  const b = bars("X", [["2026-09-24", 100], ["2026-09-25", 101], ["2026-09-28", 110], ["2026-09-29", 121], ["2026-09-30", 133.1]]);

  it("enters on the next trading close strictly after the signal date", () => {
    const fr = computeForwardReturns(b, ["2026-09-25"], [1]);
    expect(fr[0]).toMatchObject({ signalDate: "2026-09-25", entryDate: "2026-09-28", exitDate: "2026-09-29" });
    expect(fr[0]?.ret).toBeCloseTo(0.1, 10);
  });

  it("maps weekend signals to Monday entry", () => {
    const fr = computeForwardReturns(b, ["2026-09-26", "2026-09-27"], [1]);
    expect(fr.map((x) => x.entryDate)).toEqual(["2026-09-28", "2026-09-28"]);
  });

  it("does not create labels beyond the last price", () => {
    expect(computeForwardReturns(b, ["2026-09-29"], [1])).toHaveLength(0);
    expect(computeForwardReturns(b, ["2026-09-24"], [5])).toHaveLength(0);
  });

  it("never uses the signal-day close", () => {
    for (const r of computeForwardReturns(b, ["2026-09-24", "2026-09-25", "2026-09-28"], [1, 2])) expect(r.entryDate > r.signalDate).toBe(true);
    expect(firstIndexAfter(["a", "b", "c"], "b")).toBe(2);
  });
});

function sections(nDates: number, beta: number, seed = 1): CrossSection[] {
  const rng = new Rng(seed);
  return Array.from({ length: nDates }, (_, d) => {
    const obs = Array.from({ length: 60 }, (_, i) => {
      const s = rng.normal();
      return { ticker: `T${i}`, sector: i % 2 ? "A" : "B", signal: s, ret: beta * s * 0.01 + 0.01 * rng.normal() };
    });
    return { date: `2026-01-${String((d % 28) + 1).padStart(2, "0")}-${d}`, obs, eligible: 60 };
  });
}

describe("cross-sectional statistics", () => {
  it("recovers a planted relationship and finds none when there is none", () => {
    const strong = summarize(sections(60, 0.5).map(computeDateStat).filter((x) => x !== null), 1);
    expect(strong.meanRankIc).toBeGreaterThan(0.3);
    expect(strong.tStat).toBeGreaterThan(5);
    expect(strong.meanSpread).toBeGreaterThan(0);
    const none = summarize(sections(60, 0, 9).map(computeDateStat).filter((x) => x !== null), 1);
    expect(Math.abs(none.meanRankIc ?? 1)).toBeLessThan(0.05);
    expect(Math.abs(none.tStat ?? 99)).toBeLessThan(3);
  });

  it("skips thin cross-sections", () => {
    expect(computeDateStat({ date: "d", obs: sections(1, 1)[0]!.obs.slice(0, 10), eligible: 60 })).toBeNull();
  });

  it("uses non-overlapping dates for inference", () => {
    expect(nonOverlapping([1, 2, 3, 4, 5, 6], 5)).toEqual([1, 6]);
    const st = sections(40, 0.3).map(computeDateStat).filter((x) => x !== null);
    expect(summarize(st, 5).nonOverlappingDates).toBe(8);
  });

  it("splits chronologically and walks forward without peeking", () => {
    const st = sections(50, -0.4).map(computeDateStat).filter((x) => x !== null);
    const sp = splitDates(st);
    expect(sp.calibration.length + sp.validation.length + sp.test.length).toBe(50);
    expect(sp.calibration.at(-1)).toBe(st[sp.calibration.length - 1]);
    expect(sp.test[0]).toBe(st[sp.calibration.length + sp.validation.length]);
    const wf = walkForward({ only: st }, 3, 20);
    expect(wf.folds.every((f) => f.sign === -1)).toBe(true); // learned the negative sign from training data
    expect(wf.oosMeanRankIc).toBeGreaterThan(0);
  });

  it("measures turnover", () => {
    expect(turnover(["a", "b", "c", "d"], ["a", "b", "x", "y"])).toBe(0.5);
  });
});
