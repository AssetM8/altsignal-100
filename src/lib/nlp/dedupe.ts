import { canonicalUrl } from "./clean";
import { hashString } from "../util/rng";

export type DedupeStatus = "unique" | "duplicate_url" | "crosspost" | "duplicate_exact" | "near_duplicate" | "bot_repeat";

export interface DedupeInput {
  key: string;
  url: string | null;
  community: string | null;
  authorHash: string | null;
  text: string;
}

export interface DedupeResult {
  status: DedupeStatus;
  duplicateOf: string | null;
}

function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9$ ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** 64-bit SimHash over word bigram shingles, returned as two 32-bit halves. */
export function simhash(text: string): [number, number] {
  const words = normalizeForHash(text).split(" ").filter(Boolean);
  const shingles = words.length < 2 ? words : words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`);
  const v = new Array<number>(64).fill(0);
  for (const sh of shingles) {
    const h1 = hashString(sh);
    const h2 = hashString(`${sh}#`);
    for (let b = 0; b < 32; b++) {
      v[b] = (v[b] as number) + ((h1 >>> b) & 1 ? 1 : -1);
      v[b + 32] = (v[b + 32] as number) + ((h2 >>> b) & 1 ? 1 : -1);
    }
  }
  let lo = 0;
  let hi = 0;
  for (let b = 0; b < 32; b++) {
    if ((v[b] as number) > 0) lo |= 1 << b;
    if ((v[b + 32] as number) > 0) hi |= 1 << b;
  }
  return [lo >>> 0, hi >>> 0];
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function hamming(a: [number, number], b: [number, number]): number {
  return popcount((a[0] ^ b[0]) >>> 0) + popcount((a[1] ^ b[1]) >>> 0);
}

/**
 * Streaming de-duplicator. Feed documents in publication order; each is
 * compared against everything seen before using exact keys and a banded
 * SimHash index (Hamming ≤ 3 is guaranteed to share one of 4 bands).
 */
export class Deduplicator {
  private urls = new Map<string, { key: string; community: string | null }>();
  private exact = new Map<string, string>();
  private bands = new Map<string, { key: string; sig: [number, number]; author: string | null }[]>();
  private authorRepeats = new Map<string, number>();
  constructor(private readonly maxHamming = 3, private readonly botRepeatThreshold = 3) {}

  check(doc: DedupeInput): DedupeResult {
    const cu = canonicalUrl(doc.url);
    // Self-posts on Reddit/HN point at their own discussion page; only external links are shared URLs.
    const isExternal = cu !== null && !/^(reddit\.com\/r\/|news\.ycombinator\.com\/item)/.test(cu);
    if (cu && isExternal) {
      const prev = this.urls.get(cu);
      if (prev) {
        return { status: prev.community !== doc.community ? "crosspost" : "duplicate_url", duplicateOf: prev.key };
      }
      this.urls.set(cu, { key: doc.key, community: doc.community });
    }

    const norm = normalizeForHash(doc.text);
    if (norm.length < 12) return { status: "unique", duplicateOf: null };
    const exactPrev = this.exact.get(norm);
    if (exactPrev) return this.flagRepeat(doc, "duplicate_exact", exactPrev);
    this.exact.set(norm, doc.key);

    const sig = simhash(doc.text);
    const bandKeys = [0, 1, 2, 3].map((i) => {
      const word = i < 2 ? sig[0] : sig[1];
      const part = i % 2 === 0 ? word & 0xffff : word >>> 16;
      return `${i}:${part}`;
    });
    for (const bk of bandKeys) {
      for (const cand of this.bands.get(bk) ?? []) {
        if (hamming(cand.sig, sig) <= this.maxHamming) return this.flagRepeat(doc, "near_duplicate", cand.key);
      }
    }
    for (const bk of bandKeys) {
      const arr = this.bands.get(bk) ?? [];
      arr.push({ key: doc.key, sig, author: doc.authorHash });
      this.bands.set(bk, arr);
    }
    return { status: "unique", duplicateOf: null };
  }

  private flagRepeat(doc: DedupeInput, status: DedupeStatus, of: string): DedupeResult {
    if (doc.authorHash) {
      const n = (this.authorRepeats.get(doc.authorHash) ?? 0) + 1;
      this.authorRepeats.set(doc.authorHash, n);
      if (n + 1 >= this.botRepeatThreshold) return { status: "bot_repeat", duplicateOf: of };
    }
    return { status, duplicateOf: of };
  }
}
