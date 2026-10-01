import { getSectors } from "@/lib/services/views";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/sectors — sector aggregates for the as-of date. */
export async function GET() {
  try {
    return json({ sectors: await getSectors() }, { maxAge: 300 });
  } catch (e) {
    return errorResponse(e);
  }
}
