import { z } from "zod";
import { getDataset, getDailyMetrics } from "@/lib/services/dataset";
import { errorResponse, json, searchParamsObject } from "@/lib/http";
import { addDays } from "@/lib/util/dates";

export const dynamic = "force-dynamic";

/** GET /api/stocks/:ticker/sources?days=30 — daily per-source metrics (aggregates only, no raw text). */
export async function GET(req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  try {
    const ticker = z.string().regex(/^[A-Za-z.\-]{1,10}$/).parse((await ctx.params).ticker).toUpperCase();
    const days = z.coerce.number().int().min(1).max(240).default(30).parse(searchParamsObject(req.url).days);
    const ds = await getDataset();
    if (!ds.companyByTicker.has(ticker)) return json({ error: `Ticker ${ticker} is not in the universe` }, { status: 404 });
    const rows = await getDailyMetrics(ticker, addDays(ds.meta.asOf, -(days - 1)), ds.meta.asOf);
    return json({ ticker, isSynthetic: ds.meta.isSynthetic, sources: ds.sources.map(({ descriptor: _d, ...s }) => s), metrics: rows.filter((r) => !ds.meta.runtimeDisabled.includes(r.sourceId as never)) }, { maxAge: 60 });
  } catch (e) {
    return errorResponse(e);
  }
}
