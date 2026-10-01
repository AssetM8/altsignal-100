import { getDataset } from "@/lib/services/dataset";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/universe — the dated universe snapshot in use. */
export async function GET() {
  try {
    const ds = await getDataset();
    return json(
      {
        asOf: ds.meta.universeAsOf,
        provider: ds.meta.universeProvider,
        isLive: ds.meta.universeIsLive,
        isSynthetic: ds.meta.isSynthetic,
        companies: ds.companies,
      },
      { maxAge: 300 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
