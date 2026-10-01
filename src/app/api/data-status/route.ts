import { getDataStatus } from "@/lib/services/views";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/data-status — source states, ingestion runs, quality events, model versions. */
export async function GET() {
  try {
    const s = await getDataStatus();
    return json({ ...s, sources: s.sources.map(({ descriptor, ...rest }) => ({ ...rest, rateLimit: descriptor.rateLimit, license: descriptor.license, requiredEnv: descriptor.requiredEnv })) }, { maxAge: 30 });
  } catch (e) {
    return errorResponse(e);
  }
}
