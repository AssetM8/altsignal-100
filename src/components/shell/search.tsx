"use client";
import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface SearchItem {
  ticker: string;
  name: string;
  sector: string;
}

/** Ticker / company search with keyboard support (combobox pattern). */
export function StockSearch({ items }: { items: SearchItem[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items
      .map((it) => {
        const t = it.ticker.toLowerCase();
        const n = it.name.toLowerCase();
        const score = t === s ? 0 : t.startsWith(s) ? 1 : n.startsWith(s) ? 2 : n.includes(s) || t.includes(s) ? 3 : 9;
        return { it, score };
      })
      .filter((x) => x.score < 9)
      .sort((a, b) => a.score - b.score || a.it.ticker.localeCompare(b.it.ticker))
      .slice(0, 8)
      .map((x) => x.it);
  }, [q, items]);

  const go = (ticker: string) => {
    setOpen(false);
    setQ("");
    router.push(`/company/${encodeURIComponent(ticker)}`);
  };

  return (
    <div className="relative w-full max-w-xs">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search ticker or company
      </label>
      <input
        ref={inputRef}
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].ticker}` : undefined}
        placeholder="Search ticker or company"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && results[active]) go(results[active].ticker);
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-full border border-line bg-ink px-3 py-1.5 text-sm text-fg placeholder:text-faint"
      />
      {open && q.trim() ? (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 w-full border border-line bg-raised shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No company matches “{q}”. Try a ticker such as NVDA.</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.ticker}
                id={`${listId}-${r.ticker}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); go(r.ticker); }}
                className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm ${i === active ? "bg-line" : ""}`}
              >
                <span className="w-14 font-semibold">{r.ticker}</span>
                <span className="truncate text-muted">{r.name}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
