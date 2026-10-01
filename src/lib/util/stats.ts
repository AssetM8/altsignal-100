/** Small, dependency-free statistics toolkit. Functions ignore null/NaN unless stated. */
export type Maybe = number | null | undefined;

export const isNum = (x: Maybe): x is number => typeof x === "number" && Number.isFinite(x);

export function clean(xs: readonly Maybe[]): number[] {
  return xs.filter(isNum);
}

export function mean(xs: readonly Maybe[]): number | null {
  const v = clean(xs);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function sum(xs: readonly Maybe[]): number {
  return clean(xs).reduce((a, b) => a + b, 0);
}

export function std(xs: readonly Maybe[], ddof = 1): number | null {
  const v = clean(xs);
  if (v.length <= ddof) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - ddof));
}

export function quantile(xs: readonly Maybe[], q: number): number | null {
  const v = clean(xs).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = v[lo] as number;
  const b = v[hi] as number;
  return a + (b - a) * (pos - lo);
}

export const median = (xs: readonly Maybe[]) => quantile(xs, 0.5);

/** Median absolute deviation scaled to be consistent with σ under normality. */
export function mad(xs: readonly Maybe[]): number | null {
  const m = median(xs);
  if (m === null) return null;
  return (median(clean(xs).map((x) => Math.abs(x - m))) ?? 0) * 1.4826;
}

export function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |err| < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i] as number; my += ys[i] as number; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Average ranks (ties get the mean rank), 1-based. */
export function rank(xs: readonly number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && (idx[j + 1] as readonly [number, number])[0] === (idx[i] as readonly [number, number])[0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[(idx[k] as readonly [number, number])[1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  return pearson(rank(xs), rank(ys));
}

/** Cross-sectional z-score; nulls preserved. */
export function zscoreCross(xs: readonly Maybe[]): (number | null)[] {
  const m = mean(xs);
  const s = std(xs);
  return xs.map((x) => (isNum(x) && m !== null && s && s > 0 ? (x - m) / s : null));
}

export function tStat(xs: readonly number[]): number | null {
  const m = mean(xs);
  const s = std(xs);
  if (m === null || !s || xs.length < 3) return null;
  return m / (s / Math.sqrt(xs.length));
}
