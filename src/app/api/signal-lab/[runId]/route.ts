import { z } from "zod";
import { getLabRun } from "@/lib/services/lab";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/signal-lab/:runId — a stored Signal Lab run. */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  try {
    const id = z.string().uuid().parse((await ctx.params).runId);
    const r = await getLabRun(id);
    if (!r) return json({ error: "Run not found" }, { status: 404 });
    return json(r, { maxAge: 3600 });
  } catch (e) {
    return errorResponse(e);
  }
}
