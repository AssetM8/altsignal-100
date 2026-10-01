import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { DatasetNotReadyError } from "./services/dataset";

export function json<T>(data: T, init?: { status?: number; maxAge?: number }) {
  const res = NextResponse.json(data, { status: init?.status ?? 200 });
  if (init?.maxAge) res.headers.set("Cache-Control", `private, max-age=${init.maxAge}, stale-while-revalidate=${init.maxAge * 4}`);
  else res.headers.set("Cache-Control", "no-store");
  return res;
}

export function errorResponse(e: unknown) {
  if (e instanceof ZodError) return json({ error: "Invalid request", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  if (e instanceof DatasetNotReadyError) return json({ error: e.message }, { status: 503 });
  console.error("[api]", e instanceof Error ? e.message : e);
  return json({ error: "Internal error" }, { status: 500 });
}

/** Fixed-window in-memory rate limiter (per process). Adequate for a single-node research app. */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  return b.count > limit ? { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) } : { ok: true, retryAfter: 0 };
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function searchParamsObject(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams.entries());
}
