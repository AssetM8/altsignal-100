import type { Metadata } from "next";
import { Suspense } from "react";
import { SignalLab } from "@/components/lab";
import { getDataset } from "@/lib/services/dataset";
import { addDays } from "@/lib/util/dates";

export const metadata: Metadata = { title: "Signal lab" };
export const dynamic = "force-dynamic";

export default async function LabPage() {
  const ds = await getDataset();
  // The first ~37 days have no baseline yet, so start the default range after the warm-up.
  const first = ds.dates.find((d) => d >= addDays(ds.dates[0] as string, 37)) ?? (ds.dates[0] as string);
  return (
    <div className="mx-auto max-w-[1500px] space-y-3">
      <div>
        <h1 className="text-xl font-bold">Signal lab</h1>
        <p className="max-w-3xl text-sm text-muted">
          Test whether an alternative-data feature historically lined up with later returns. Results use neutral language on purpose: an association in this sample is not a forecast.
          {ds.meta.isSynthetic ? " In demo mode both signals and prices are synthetic." : ""}
        </p>
      </div>
      <Suspense>
        <SignalLab sectors={Array.from(new Set(ds.companies.map((c) => c.sector))).sort()} firstDate={first} lastDate={ds.meta.asOf} isSynthetic={ds.meta.isSynthetic} />
      </Suspense>
    </div>
  );
}
