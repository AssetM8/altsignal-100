import { createHash } from "node:crypto";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Minimal politeness throttle: at most one request every `minIntervalMs`. */
export class Throttle {
  private last = 0;
  constructor(private readonly minIntervalMs: number) {}
  async wait(): Promise<void> {
    const now = Date.now();
    const delay = this.last + this.minIntervalMs - now;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    this.last = Date.now();
  }
}

export async function getJson<T>(f: FetchLike, url: string, headers: Record<string, string>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await f(url, { headers });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** One-way salted hash for author handles; raw usernames are never stored. */
export function hashAuthor(source: string, handle: string | null | undefined): string | null {
  if (!handle) return null;
  const salt = process.env.ALTSIGNAL_AUTHOR_SALT || "altsignal-default-salt";
  return `h${createHash("sha256").update(`${salt}:${source}:${handle}`).digest("hex").slice(0, 16)}`;
}

export const compactDate = (d: string) => d.replaceAll("-", "");
