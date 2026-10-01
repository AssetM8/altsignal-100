import { runSignalLab } from "@/lib/services/lab";
import { clientKey, errorResponse, json, rateLimit } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/signal-lab/run — body validated by LabParamsSchema. Rate limited: 10 runs/min per client. */
export async function POST(req: Request) {
  const rl = rateLimit(`lab:${clientKey(req)}`, 10, 60_000);
  if (!rl.ok) {
    const res = json({ error: `Too many Signal Lab runs. Try again in ${rl.retryAfter}s.` }, { status: 429 });
    res.headers.set("Retry-After", String(rl.retryAfter));
    return res;
  }
  try {
    const text = await req.text();
    if (text.length > 10_000) return json({ error: "Request body too large" }, { status: 413 });
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return json({ error: "Body must be JSON" }, { status: 400 });
    }
    const r = await runSignalLab(body);
    if (!r.ok) return json({ error: r.error }, { status: 422 });
    return json({ runId: r.runId, result: r.result });
  } catch (e) {
    return errorResponse(e);
  }
}
