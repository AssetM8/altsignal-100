"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SOURCE_LABEL } from "@/lib/format";

const SOURCES = ["all", "reddit", "hackernews", "wikipedia", "search", "github"] as const;

/** URL-driven filter bar shared by the overview and the explorer. */
export function FilterBar({ sectors, showWindow = true }: { sectors: string[]; showWindow?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string, dflt: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v === dflt) next.delete(k);
    else next.set(k, v);
    start(() => router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  const sel = "border border-line bg-ink px-2 py-1 text-sm text-fg";
  return (
    <form className="flex flex-wrap items-end gap-3" aria-busy={pending} onSubmit={(e) => e.preventDefault()}>
      {showWindow ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-2xs text-muted">Window</legend>
          <div className="flex" role="radiogroup" aria-label="Time window">
            {["7", "30", "90"].map((w) => {
              const on = (sp.get("window") ?? "30") === w;
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("window", w, "30")}
                  className={`border border-line px-2.5 py-1 text-sm ${on ? "bg-cyan/20 text-fg" : "text-muted hover:text-fg"} -ml-px first:ml-0`}
                >
                  {w}d
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <label className="flex flex-col gap-1 text-2xs text-muted">
        Source
        <select className={sel} value={sp.get("source") ?? "all"} onChange={(e) => set("source", e.target.value, "all")} data-testid="filter-source">
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All sources (composite)" : SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-2xs text-muted">
        Sector
        <select className={sel} value={sp.get("sector") ?? "all"} onChange={(e) => set("sector", e.target.value, "all")} data-testid="filter-sector">
          <option value="all">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-2xs text-muted">
        Min. data confidence
        <select className={sel} value={sp.get("minConfidence") ?? "0"} onChange={(e) => set("minConfidence", e.target.value, "0")}>
          {["0", "40", "60", "75"].map((c) => (
            <option key={c} value={c}>
              {c === "0" ? "Any" : `≥ ${c}`}
            </option>
          ))}
        </select>
      </label>
      {pending ? <span className="pb-1.5 text-2xs text-muted" role="status">Updating…</span> : null}
    </form>
  );
}
