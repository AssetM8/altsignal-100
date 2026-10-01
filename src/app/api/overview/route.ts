import { ViewQuerySchema, getOverview } from "@/lib/services/views";
import { errorResponse, json, searchParamsObject } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/overview?window=30&source=all&sector=all&minConfidence=0 */
export async function GET(req: Request) {
  try {
    const q = ViewQuerySchema.parse(searchParamsObject(req.url));
    return json(await getOverview(q), { maxAge: 60 });
  } catch (e) {
    return errorResponse(e);
  }
}
