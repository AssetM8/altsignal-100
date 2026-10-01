import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { computeSourceFeatures, type DailyMetricRow } from "@/lib/signals/features";
import { computeSignalsForDate, normalizeWeights } from "@/lib/signals/composite";
import { addDays, dateRange } from "@/lib/util/dates";
import { BASELINE, DEFAULT_WEIGHTS, type SourceId } from "@/config/signal";
import { zscoreCross } from "@/lib/util/stats";

const START = "2026-01-01";
const days = dateRange(START, "2026-03-31");
const series = (fn: (i: number, d: string) => number | null): DailyMetricRow[] =>
  days.map((d, i) => ({ d, v: fn(i, d) })).filter((x) => x.v !== null).map(({ d, v }) => ({ date: d, value: v as number }));

describe("point-in-time features", () => {
  it("produces a large positive z for an attention spike and clips it", () => {
    const rows = series((i) => (i >= 80 ? 50_000 : 1000 + (i % 5) * 20));
    const f = computeSourceFeatures("wikipedia", rows, days);
    const at = f.find((x) => x.date === days[85]);
    expect(at?.abnormalZ).toBe(BASELINE.zClip);
    const calm = f.find((x) => x.date === days[60]);
    expect(Math.abs(calm?.abnormalZ ?? 99)).toBeLessThan(2.5);
  });

  it("returns null (not zero) when the baseline is too short or data are missing", () => {
    const f = computeSourceFeatures("wikipedia", series((i) => 1000 + i), days);
    expect(f[5]?.abnormalZ).toBeNull(); // warm-up period
    const gappy = computeSourceFeatures("wikipedia", series((i, d) => (d >= "2026-03-10" && d <= "2026-03-20" ? null : 1000)), days);
    const inGap = gappy.find((x) => x.date === "2026-03-20");
    expect(inGap?.abnormalZ).toBeNull();
    expect(inGap?.available).toBe(false);
    expect(inGap?.freshnessDays).toBe(11);
  });

  it("never uses data dated after t (look-ahead guard)", () => {
    const base = series((i) => 1000 + ((i * 37) % 100));
    const t = days[70] as string;
    const before = computeSourceFeatures("wikipedia", base, days).find((x) => x.date === t);
    // Change every observation after t dramatically: features at t must not move.
    const mutated = base.map((r) => (r.date > t ? { ...r, value: r.value * 1000 } : r));
    const after = computeSourceFeatures("wikipedia", mutated, days).find((x) => x.date === t);
    expect(after).toEqual(before);
  });

  it("standardises cross-sectionally and preserves nulls", () => {
    const z = zscoreCross([1, 2, 3, null]);
    expect(z[3]).toBeNull();
    expect(z[1]).toBeCloseTo(0, 10);
  });
});

function featuresFor(z: number, sentiment: number | null, mentions = 200, extra: Partial<Record<string, number>> = {}) {
  const base = { available: true, obsShort: 7, obsBaseline: 30, lastObservedDate: "2026-03-31", freshnessDays: 0, activity7: 10, accelZ: 0, authors7: 50, engagement7: 100, sentimentPrev7: sentiment, sentimentChange: 0, posShare7: 0.5, negShare7: 0.2, sentimentConfidence7: 0.7, investment7: sentiment, product7: sentiment, reputation7: sentiment, dupRatio7: 0, botRatio7: 0, ambiguity7: 0, breadth7: 3 };
  return {
    reddit: { ...base, date: "2026-03-31", source: "reddit" as SourceId, abnormalZ: z, mentions7: mentions, sentiment7: sentiment, ...extra },
    hackernews: { ...base, date: "2026-03-31", source: "hackernews" as SourceId, abnormalZ: z, mentions7: mentions / 4, sentiment7: sentiment, ...extra },
    wikipedia: { ...base, date: "2026-03-31", source: "wikipedia" as SourceId, abnormalZ: z, mentions7: null, sentiment7: null },
  };
}

describe("composite signal", () => {
  const expected = new Map<string, SourceId[]>();
  const universe = (entries: Record<string, ReturnType<typeof featuresFor> | Record<string, never>>) => {
    const m = new Map<string, Partial<Record<SourceId, never>>>();
    for (const [k, v] of Object.entries(entries)) {
      m.set(k, v as never);
      expected.set(k, ["reddit", "hackernews", "wikipedia"]);
    }
    return m as never;
  };

  it("maps positive tone + abnormal attention above 50, negative below, and keeps every component traceable", () => {
    const sigs = computeSignalsForDate("2026-03-31", universe({ UP: featuresFor(2, 0.4), DN: featuresFor(2, -0.4), FLAT: featuresFor(0, 0) }), { expectedSources: expected });
    const by = Object.fromEntries(sigs.map((s) => [s.ticker, s]));
    expect(by.UP?.altSignalScore).toBeGreaterThan(55);
    expect(by.DN?.altSignalScore).toBeLessThan(45);
    expect(by.FLAT?.altSignalScore).toBeCloseTo(50, 0);
    const up = by.UP!;
    const sum = Object.values(up.contributions).reduce<number>((a, b) => a + (b ?? 0), 0);
    expect(up.rawScore).toBeCloseTo(50 + 50 * sum, 0);
  });

  it("treats attention as undirected: quiet periods do not push the score down", () => {
    const sigs = computeSignalsForDate("2026-03-31", universe({ Q: featuresFor(-3, 0.3), N: featuresFor(0, 0.3) }), { expectedSources: expected });
    const [q, n] = sigs;
    expect(q?.components.abnormalAttention).toBe(0);
    expect(q?.altSignalScore).toBeCloseTo(n?.altSignalScore ?? 0, 0);
  });

  it("shrinks toward neutral when confidence is low or penalties apply", () => {
    const strong = computeSignalsForDate("2026-03-31", universe({ A: featuresFor(2, 0.4, 400) }), { expectedSources: expected })[0]!;
    const thin = computeSignalsForDate("2026-03-31", universe({ A: featuresFor(2, 0.4, 6) }), { expectedSources: expected })[0]!;
    expect(thin.confidence).toBeLessThan(strong.confidence);
    expect(thin.penalties.map((p) => p.key)).toContain("tinySample");
    expect(Math.abs((thin.altSignalScore ?? 50) - 50)).toBeLessThan(Math.abs((strong.altSignalScore ?? 50) - 50));
    const bots = computeSignalsForDate("2026-03-31", universe({ A: featuresFor(2, 0.4, 400, { botRatio7: 0.4 }) }), { expectedSources: expected })[0]!;
    expect(bots.penalties.map((p) => p.key)).toContain("bots");
  });

  it("handles missing data: no sources gives a null score and zero confidence", () => {
    const s = computeSignalsForDate("2026-03-31", universe({ X: {} }), { expectedSources: expected })[0]!;
    expect(s.altSignalScore).toBeNull();
    expect(s.confidence).toBe(0);
    expect(s.agreement).toBeNull();
  });

  it("excluding sources changes coverage but never crashes", () => {
    const s = computeSignalsForDate("2026-03-31", universe({ A: featuresFor(2, 0.4) }), { expectedSources: expected, excludeSources: ["reddit", "hackernews"] })[0]!;
    expect(s.sourcesAvailable).toEqual(["wikipedia"]);
    expect(s.sentimentScore).toBeNull();
    expect(s.penalties.map((p) => p.key)).toContain("singleSource");
  });

  it("normalises custom weights", () => {
    const w = normalizeWeights({ ...DEFAULT_WEIGHTS, sentiment: 0.9 });
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("signal modules never import market data", () => {
    for (const f of ["src/lib/signals/composite.ts", "src/lib/signals/features.ts", "src/lib/pipeline/process-text.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/fixtures\/prices|MarketDataProvider|forwardReturns|marketPrices|backtest\/labels/);
    }
  });
});

describe("dates", () => {
  it("adds days across month ends in UTC", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
