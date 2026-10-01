import type { ReactNode } from "react";
import clsx from "clsx";
import { divergingTint, fmtNum, fmtSigned } from "@/lib/format";

export function Panel({
  title,
  note,
  actions,
  children,
  className,
  id,
}: {
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const hid = id ?? `p-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={hid} className={clsx("min-w-0 border border-line bg-panel", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-2">
        <h2 id={hid} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        {actions}
      </header>
      <div className="overflow-x-auto p-3">{children}</div>
      {note ? <p className="border-t border-line-soft px-3 py-1.5 text-2xs text-faint">{note}</p> : null}
    </section>
  );
}

/** Signed value with ▲/▼ so meaning never depends on colour alone. */
export function Signed({ value, digits = 1, suffix = "", className }: { value: number | null | undefined; digits?: number; suffix?: string; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={clsx("num text-faint", className)}>—</span>;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span className={clsx("num whitespace-nowrap", flat ? "text-muted" : up ? "text-pos" : "text-neg", className)}>
      <span aria-hidden="true" className="mr-0.5 text-[0.7em]">{flat ? "■" : up ? "▲" : "▼"}</span>
      {fmtSigned(value, digits)}
      {suffix}
      <span className="sr-only">{flat ? " unchanged" : up ? " positive" : " negative"}</span>
    </span>
  );
}

/** 0–100 score cell with a tint centred on 50 (neutral). */
export function ScoreCell({ value, className }: { value: number | null | undefined; className?: string }) {
  const v = value === null || value === undefined ? null : (value - 50) / 30;
  return (
    <span className={clsx("num inline-block min-w-[3.25rem] px-1.5 py-0.5 text-right font-semibold", className)} style={{ background: divergingTint(v) }}>
      {fmtNum(value)}
    </span>
  );
}

export function Meter({ value, max = 100, color = "var(--color-cyan)", label }: { value: number | null; max?: number; color?: string; label: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="inline-flex items-center gap-1.5" title={`${label}: ${fmtNum(value, 0)}`}>
      <span className="relative inline-block h-1.5 w-12 bg-line" aria-hidden="true">
        <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="num text-xs text-muted">{fmtNum(value, 0)}</span>
    </span>
  );
}

const STATE_STYLE: Record<string, string> = {
  live: "border-pos/50 text-pos",
  demo: "border-amber/60 text-amber",
  stale: "border-violet/60 text-violet",
  unavailable: "border-neg/60 text-neg",
};
const STATE_TEXT: Record<string, string> = { live: "Live", demo: "Demo", stale: "Stale", unavailable: "Unavailable" };

export function StateBadge({ state, className }: { state: string; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 border px-1.5 py-px text-2xs font-semibold", STATE_STYLE[state] ?? "border-line text-muted", className)}>
      <span aria-hidden="true">{state === "live" ? "●" : state === "unavailable" ? "○" : "◐"}</span>
      {STATE_TEXT[state] ?? state}
    </span>
  );
}

export function HypeTag({ level }: { level: "low" | "elevated" | "high" }) {
  if (level === "low") return <span className="text-xs text-faint">Low</span>;
  return (
    <span className={clsx("border px-1 text-2xs font-semibold", level === "high" ? "border-neg/60 text-neg" : "border-amber/60 text-amber")}>
      {level === "high" ? "High" : "Elevated"}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-1 border border-dashed border-line px-4 py-6 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {children ? <div className="max-w-md text-xs text-muted">{children}</div> : null}
    </div>
  );
}

/** Coloured label pinned to a chart, after the screenshot's metric tags. */
export function Tag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg">
      <span aria-hidden="true" className="inline-block h-2.5 w-2.5" style={{ background: color }} />
      {children}
    </span>
  );
}
