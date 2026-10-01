import { z } from "zod";
import { getDataset } from "@/lib/services/dataset";
import { errorResponse, json, searchParamsObject } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/stocks/:ticker/signals?start=YYYY-MM-DD&end=YYYY-MM-DD — daily composite with full component detail. */
export async function GET(req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  try {
    const ticker = z.string().regex(/^[A-Za-z.\-]{1,10}$/).parse((await ctx.params).ticker).toUpperCase();
    const p = z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(searchParamsObject(req.url));
    const ds = await getDataset();
    if (!ds.companyByTicker.has(ticker)) return json({ error: `Ticker ${ticker} is not in the universe` }, { status: 404 });
    const signals = ds.dates
      .filter((d) => (!p.start || d >= p.start) && (!p.end || d <= p.end))
      .map((d) => ds.signals.get(d)?.get(ticker))
      .filter(Boolean);
    return json({ ticker, isSynthetic: ds.meta.isSynthetic, model: ds.meta.compositeModel, signals }, { maxAge: 60 });
  } catch (e) {
    return errorResponse(e);
  }
}
