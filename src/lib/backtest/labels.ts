import type { PriceBar } from "../providers/types";

export const HORIZONS = [1, 5, 10, 20] as const;
export type Horizon = (typeof HORIZONS)[number];

export interface ForwardReturn {
  ticker: string;
  signalDate: string;
  horizon: number;
  entryDate: string;
  exitDate: string;
  ret: number;
}

/**
 * Forward-return labels, aligned to avoid look-ahead.
 *
 * A signal dated d uses alt-data published up to 23:59:59 UTC on d (after the
 * US close). We assume it can only be acted on at the NEXT trading day's close
 * (entry = first trading day strictly after d), and measure the return over
 * the following `horizon` trading days: close(entry + h) / close(entry) − 1.
 * Labels whose exit date is beyond the last available price are not created.
 */
export function computeForwardReturns(bars: PriceBar[], signalDates: string[], horizons: readonly number[] = HORIZONS): ForwardReturn[] {
  const byTicker = new Map<string, PriceBar[]>();
  for (const b of bars) byTicker.set(b.ticker, [...(byTicker.get(b.ticker) ?? []), b]);
  const out: ForwardReturn[] = [];
  for (const [ticker, list] of byTicker) {
    const sorted = list.sort((a, b) => a.date.localeCompare(b.date));
    const dates = sorted.map((b) => b.date);
    for (const d of signalDates) {
      const entryIdx = firstIndexAfter(dates, d);
      if (entryIdx < 0) continue;
      for (const h of horizons) {
        const exitIdx = entryIdx + h;
        if (exitIdx >= sorted.length) continue;
        const entry = sorted[entryIdx] as PriceBar;
        const exit = sorted[exitIdx] as PriceBar;
        out.push({ ticker, signalDate: d, horizon: h, entryDate: entry.date, exitDate: exit.date, ret: exit.close / entry.close - 1 });
      }
    }
  }
  return out;
}

/** Index of the first element strictly greater than `d` (binary search), or -1. */
export function firstIndexAfter(sortedDates: string[], d: string): number {
  let lo = 0;
  let hi = sortedDates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sortedDates[mid] as string) <= d) lo = mid + 1;
    else hi = mid;
  }
  return lo < sortedDates.length ? lo : -1;
}
