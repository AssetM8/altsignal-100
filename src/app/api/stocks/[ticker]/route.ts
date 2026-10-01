import { z } from "zod";
import { getStockDetail } from "@/lib/services/views";
import { errorResponse, json, searchParamsObject } from "@/lib/http";

export const dynamic = "force-dynamic";
const TickerSchema = z.string().regex(/^[A-Za-z.\-]{1,10}$/, "invalid ticker");

/** GET /api/stocks/:ticker?window=90 — company detail (representative items are previews only). */
export async function GET(req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  try {
    const ticker = TickerSchema.parse((await ctx.params).ticker);
    const window = z.coerce.number().int().min(7).max(240).default(90).parse(searchParamsObject(req.url).window);
    const d = await getStockDetail(ticker, window);
    if (!d) return json({ error: `Ticker ${ticker} is not in the universe` }, { status: 404 });
    return json(d, { maxAge: 60 });
  } catch (e) {
    return errorResponse(e);
  }
}
