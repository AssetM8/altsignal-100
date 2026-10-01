/**
 * Date helpers. All analytics use UTC calendar dates (YYYY-MM-DD).
 * An alt-data "day d" contains items published in [d 00:00Z, d+1 00:00Z).
 */
const DAY_MS = 86_400_000;

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`Invalid date key: ${key}`);
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDays(key: string, n: number): string {
  return toDateKey(new Date(parseDateKey(key).getTime() + n * DAY_MS));
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDateKey(a).getTime() - parseDateKey(b).getTime()) / DAY_MS);
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Weekday (Mon–Fri) check. The demo market calendar ignores exchange holidays (documented). */
export function isWeekday(key: string): boolean {
  const dow = parseDateKey(key).getUTCDay();
  return dow !== 0 && dow !== 6;
}

export function utcDateKeyOfTimestamp(iso: string): string {
  return toDateKey(new Date(iso));
}
