import type { Metadata } from "next";
import { Suspense } from "react";
import { Explorer } from "@/components/explorer";
import { getStocks, parseViewQuery } from "@/lib/services/views";

export const metadata: Metadata = { title: "Stock explorer" };
export const dynamic = "force-dynamic";

export default async function ExplorerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // Sector and confidence are filtered client-side; the server returns the full universe.
  const q = { ...parseViewQuery(sp), sector: "all", minConfidence: 0 };
  const data = await getStocks(q);
  return (
    <div className="mx-auto max-w-[1500px] space-y-3">
      <div>
        <h1 className="text-xl font-bold">Stock explorer</h1>
        <p className="text-sm text-muted">
          All {data.rows.length} companies in the {data.meta.universeAsOf} universe snapshot. Sort any column, filter, and export what you see. Scores use alternative data only.
        </p>
      </div>
      <Suspense>
        <Explorer rows={data.rows} sectors={data.sectors} window={q.window} source={q.source} isSynthetic={data.meta.isSynthetic} asOf={data.meta.asOf} />
      </Suspense>
    </div>
  );
}
