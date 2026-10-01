import { HISTORY_DAYS } from "@/config/signal";
import type { CompanyEntity } from "../types";
import { Rng, hashString } from "../../util/rng";
import { addDays, dateRange, parseDateKey } from "../../util/dates";
import { DEMO_EVENTS, type DemoEvent } from "./events";

/**
 * The deterministic SYNTHETIC "world" behind every demo fixture provider.
 * Latent per-company attention and tone processes are shared across sources
 * so that sources are coherent but not identical (each adds its own noise,
 * coverage gaps and biases). Nothing here is real data.
 */

export const DEMO_AS_OF = "2026-09-30";
export const DEMO_START = addDays(DEMO_AS_OF, -(HISTORY_DAYS - 1));
export const DEMO_SEED = 20260930;

/** Stocks with outsized retail-social attention relative to size (assumption for realism). */
const RETAIL_FAVOURITES: Record<string, number> = {
  TSLA: 1.6, NVDA: 1.5, PLTR: 1.5, AMD: 1.1, AAPL: 0.9, HOOD: 1.2, META: 0.8, AMZN: 0.7, MSFT: 0.6, GOOGL: 0.7,
  INTC: 0.9, MU: 0.7, NFLX: 0.6, BA: 0.6, DIS: 0.5, APP: 0.8, AVGO: 0.6, CRWD: 0.5, UBER: 0.4, COST: 0.4, SBUX: 0.3,
};

export interface LatentDay {
  attention: number; // shared log-multiplier on base rates
  /** Source-specific idiosyncratic attention (AR(1)), so sources are coherent but not identical. */
  idio: Record<string, number>;
  toneInvestment: number; // [-1,1]
  toneProduct: number;
  toneReputation: number;
  sourceAttention: Record<string, number>;
  sourceToneOverride: Record<string, number>;
  botShare: number;
  priceDrift: number;
}

export interface CompanyWorld {
  ticker: string;
  base: { reddit: number; hackernews: number; wikipedia: number; search: number | null; github: number | null };
  days: Map<string, LatentDay>;
  beta: number;
}

export interface World {
  dates: string[];
  companies: Map<string, CompanyWorld>;
  marketMood: Map<string, number>;
  /** Days on which a source was not collected (simulated outages). */
  outages: Record<string, Set<string>>;
  /** Latest date with data for each source (simulates staleness). */
  latestDate: Record<string, string>;
  events: DemoEvent[];
}

function eventFor(ticker: string, date: string): DemoEvent[] {
  return DEMO_EVENTS.filter((e) => {
    if (e.ticker !== ticker) return false;
    const start = addDays(DEMO_AS_OF, -e.startOffset);
    const end = addDays(start, e.durationDays - 1);
    return date >= start && date <= end;
  });
}

/** Event intensity decays inside the window: strongest on day 1-2. */
function eventIntensity(e: DemoEvent, date: string): number {
  const start = addDays(DEMO_AS_OF, -e.startOffset);
  const k = Math.round((parseDateKey(date).getTime() - parseDateKey(start).getTime()) / 86_400_000);
  return Math.exp(-k / Math.max(2, e.durationDays / 2));
}

let cached: { key: string; world: World } | null = null;

export function buildWorld(entities: CompanyEntity[], marketCaps: Map<string, number>): World {
  const key = `${entities.length}:${DEMO_AS_OF}:${HISTORY_DAYS}`;
  if (cached && cached.key === key) return cached.world;

  const dates = dateRange(DEMO_START, DEMO_AS_OF);
  const rng = new Rng(DEMO_SEED);

  // Market-wide mood and attention factors (AR(1)).
  const marketMood = new Map<string, number>();
  const marketAttn = new Map<string, number>();
  let mm = 0;
  let ma = 0;
  for (const d of dates) {
    mm = 0.96 * mm + 0.035 * rng.normal();
    ma = 0.9 * ma + 0.06 * rng.normal();
    marketMood.set(d, mm);
    marketAttn.set(d, ma);
  }

  const companies = new Map<string, CompanyWorld>();
  for (const e of entities) {
    const r = new Rng(hashString(`${DEMO_SEED}:${e.ticker}`));
    const cap = marketCaps.get(e.ticker) ?? 1e11;
    const sizeTerm = Math.log(cap / 1e11);
    const retail = RETAIL_FAVOURITES[e.ticker] ?? 0;
    const tech = e.sector === "Information Technology" || e.sector === "Communication Services";
    const base = {
      reddit: Math.exp(0.25 + 0.45 * sizeTerm + retail + 0.3 * r.normal()),
      hackernews: (tech ? 0.9 : 0.12) * Math.exp(0.35 * sizeTerm + 0.4 * r.normal()) + (retail > 1 ? 0.4 : 0),
      wikipedia: Math.round(2500 * Math.exp(0.6 * sizeTerm + 0.6 * retail + 0.35 * r.normal())),
      // ~12% of names lack enough search volume for a stable index (realistic gap).
      search: r.chance(0.12) ? null : 20 + 50 * r.uniform(),
      github: e.githubOrgs.length ? Math.round(40 * Math.exp(0.8 * r.normal() + 0.3 * sizeTerm)) + 5 : null,
    };
    const meanTone = 0.12 * r.normal() + 0.05;
    const beta = 0.7 + 0.6 * r.uniform();
    let att = 0;
    let ti = meanTone;
    let tp = meanTone + 0.1;
    let tr = meanTone - 0.05;
    const days = new Map<string, LatentDay>();
    const idio: Record<string, number> = { reddit: 0, hackernews: 0, wikipedia: 0, search: 0, github: 0 };
    for (const d of dates) {
      att = 0.88 * att + 0.09 * r.normal();
      for (const k of Object.keys(idio)) idio[k] = 0.85 * (idio[k] as number) + 0.09 * r.normal();
      ti = meanTone + 0.92 * (ti - meanTone) + 0.07 * r.normal();
      tp = meanTone + 0.1 + 0.9 * (tp - meanTone - 0.1) + 0.06 * r.normal();
      tr = meanTone - 0.05 + 0.94 * (tr - meanTone + 0.05) + 0.05 * r.normal();
      const mood = marketMood.get(d) ?? 0;
      const day: LatentDay = {
        attention: att + (marketAttn.get(d) ?? 0),
        idio: { ...idio },
        toneInvestment: ti + mood,
        toneProduct: tp + 0.5 * mood,
        toneReputation: tr + 0.3 * mood,
        sourceAttention: {},
        sourceToneOverride: {},
        botShare: 0,
        priceDrift: 0,
      };
      for (const ev of eventFor(e.ticker, d)) {
        const k = eventIntensity(ev, d);
        for (const [src, mult] of Object.entries(ev.attention)) {
          day.sourceAttention[src] = (day.sourceAttention[src] ?? 0) + Math.log(1 + (mult - 1) * k);
        }
        if (ev.tone?.investment) day.toneInvestment += ev.tone.investment * Math.sqrt(k);
        if (ev.tone?.product) day.toneProduct += ev.tone.product * Math.sqrt(k);
        if (ev.tone?.reputation) day.toneReputation += ev.tone.reputation * Math.sqrt(k);
        for (const [src, t] of Object.entries(ev.sourceToneOverride ?? {})) day.sourceToneOverride[src] = t;
        day.botShare = Math.max(day.botShare, (ev.botShare ?? 0) * k);
        day.priceDrift += ev.priceDrift ?? 0;
      }
      const clamp = (x: number) => Math.max(-0.95, Math.min(0.95, x));
      day.toneInvestment = clamp(day.toneInvestment);
      day.toneProduct = clamp(day.toneProduct);
      day.toneReputation = clamp(day.toneReputation);
      days.set(d, day);
    }
    companies.set(e.ticker, { ticker: e.ticker, base, days, beta });
  }

  const outages: Record<string, Set<string>> = {
    reddit: new Set(dateRange(addDays(DEMO_AS_OF, -120), addDays(DEMO_AS_OF, -118))),
    hackernews: new Set(dateRange(addDays(DEMO_AS_OF, -75), addDays(DEMO_AS_OF, -69))),
    wikipedia: new Set([addDays(DEMO_AS_OF, -140)]),
    search: new Set<string>(),
    github: new Set(dateRange(addDays(DEMO_AS_OF, -95), addDays(DEMO_AS_OF, -94))),
  };
  const latestDate: Record<string, string> = {
    reddit: DEMO_AS_OF,
    hackernews: DEMO_AS_OF,
    wikipedia: DEMO_AS_OF,
    // Search-interest fixture deliberately lags 3 days to demonstrate the "stale" state.
    search: addDays(DEMO_AS_OF, -3),
    github: addDays(DEMO_AS_OF, -1),
  };

  const world: World = { dates, companies, marketMood, outages, latestDate, events: DEMO_EVENTS };
  cached = { key, world };
  return world;
}

/** Day-of-week seasonality multiplier per source (weekends quieter for work-related sources). */
export function weekdayFactor(source: string, date: string): number {
  const dow = parseDateKey(date).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  if (!weekend) return 1;
  return source === "github" ? 0.45 : source === "hackernews" ? 0.7 : source === "wikipedia" ? 0.85 : source === "reddit" ? 0.8 : 0.9;
}
