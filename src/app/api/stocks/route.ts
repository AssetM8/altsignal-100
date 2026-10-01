import { ViewQuerySchema, getStocks } from "@/lib/services/views";
import { errorResponse, json, searchParamsObject } from "@/lib/http";
import { toCsv } from "@/lib/format";

export const dynamic = "force-dynamic";

/** GET /api/stocks?window=30&source=all&sector=all&minConfidence=0[&format=csv] */
export async function GET(req: Request) {
  try {
    const params = searchParamsObject(req.url);
    const q = ViewQuerySchema.parse(params);
    const data = await getStocks(q);
    if (params.format === "csv") {
      const header = ["rank", "ticker", "name", "sector", "industry", "marketCapUsd", "score", "attention", "sentiment", "attentionAcceleration", "sentimentChange", "agreement", "divergence", "confidence", "anomalyScore", "hypeRisk", "scoreChange", "freshnessDays", "sourcesAvailable"];
      const csv = toCsv(data.rows as unknown as Record<string, unknown>[], header, [
        `AltSignal 100 export, data as of ${data.meta.asOf} (UTC)`,
        data.meta.isSynthetic ? "DEMO DATA: synthetic fixtures, not real observations" : "Live alternative data",
        "Research and educational use only. Not investment advice.",
      ]);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="altsignal100-${data.meta.isSynthetic ? "DEMO-" : ""}${data.meta.asOf}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return json(data, { maxAge: 60 });
  } catch (e) {
    return errorResponse(e);
  }
}
