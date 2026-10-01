import type { MarketDataProvider, PriceBar } from "../types";
import { Rng, hashString } from "../../util/rng";
import { addDays, dateRange, isWeekday } from "../../util/dates";
import { DEMO_SEED, type World } from "./world";

/**
 * SYNTHETIC daily closes for demo-mode research mechanics only.
 *
 * r(c,d) = beta_c * m(d) + eps(c,d) + PLANTED_COUPLING * sigma * dTone(c, d-2) + eventDrift
 *
 * PLANTED_COUPLING is a deliberately inserted, documented relationship between
 * the latent investment tone and later synthetic returns, so the Signal Lab
 * has something to (partially) recover. It says nothing about real markets.
 * Set ALTSIGNAL_PLANTED_COUPLING=0 to remove it and confirm the Lab finds no edge.
 */
export const DEFAULT_PLANTED_COUPLING = 0.35;

export class FixtureMarketDataProvider implements MarketDataProvider {
  readonly id = "fixture-prices";
  readonly isLive = false;
  constructor(private readonly world: World, private readonly coupling = Number(process.env.ALTSIGNAL_PLANTED_COUPLING ?? DEFAULT_PLANTED_COUPLING)) {}

  async getDailyCloses(tickers: string[], start: string, end: string): Promise<PriceBar[]> {
    const all = this.world.dates.filter(isWeekday);
    const mrng = new Rng(DEMO_SEED + 7);
    const market = new Map<string, number>();
    for (const d of all) market.set(d, 0.0003 + 0.009 * mrng.normal());
    const sigma = 0.015;
    const out: PriceBar[] = [];
    for (const t of tickers) {
      const cw = this.world.companies.get(t);
      if (!cw) continue;
      const rng = new Rng(hashString(`price:${t}`));
      let price = 50 + 450 * rng.uniform();
      for (const d of all) {
        const day = cw.days.get(d);
        const lagA = cw.days.get(addDays(d, -2));
        const lagB = cw.days.get(addDays(d, -7));
        const dTone = lagA && lagB ? (lagA.toneInvestment - lagB.toneInvestment) / 0.1 : 0;
        const r = cw.beta * (market.get(d) ?? 0) + sigma * rng.normal() + this.coupling * sigma * Math.max(-3, Math.min(3, dTone)) + (day?.priceDrift ?? 0);
        price *= Math.exp(r);
        if (d >= start && d <= end) out.push({ ticker: t, date: d, close: Math.round(price * 100) / 100, isSynthetic: true });
      }
    }
    return out;
  }
}

export function tradingDays(start: string, end: string): string[] {
  return dateRange(start, end).filter(isWeekday);
}
