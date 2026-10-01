import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { runIngestion } from "@/lib/pipeline/ingest";
import { invalidateDataset } from "@/lib/services/dataset";
import { getEnv } from "@/config/env";
import { DEMO_AS_OF } from "@/lib/providers/fixtures/world";
import { addDays } from "@/lib/util/dates";
import { clientKey, errorResponse, json, rateLimit, safeEqual } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

let running = false;

/**
 * POST /api/admin/refresh — incremental re-ingestion of the last N days.
 * Disabled unless ADMIN_TOKEN is set; requires `Authorization: Bearer <ADMIN_TOKEN>`.
 */
export async function POST(req: Request) {
  const env = getEnv();
  if (!env.ADMIN_TOKEN) return json({ error: "Admin refresh is disabled (ADMIN_TOKEN not set)" }, { status: 404 });
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !safeEqual(token, env.ADMIN_TOKEN)) return json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(`admin:${clientKey(req)}`, 3, 60_000);
  if (!rl.ok) return json({ error: "Rate limited" }, { status: 429 });
  if (running) return json({ error: "A refresh is already running" }, { status: 409 });
  try {
    const body = z.object({ days: z.number().int().min(1).max(60).default(3) }).parse(await req.json().catch(() => ({})));
    running = true;
    const end = env.ALTSIGNAL_MODE === "demo" ? DEMO_AS_OF : addDays(new Date().toISOString().slice(0, 10), -1);
    const summary = await runIngestion({ db: getDb(), env, start: addDays(end, -(body.days - 1)), end });
    invalidateDataset();
    return json({ ok: true, summary });
  } catch (e) {
    return errorResponse(e);
  } finally {
    running = false;
  }
}
