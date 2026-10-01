"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export const NAV = [
  { href: "/", label: "Market overview" },
  { href: "/explorer", label: "Stock explorer" },
  { href: "/lab", label: "Signal lab" },
  { href: "/methodology", label: "Sources & methodology" },
  { href: "/status", label: "Data status" },
  { href: "/about", label: "About & disclosures" },
] as const;

export function Nav({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/explorer" && path.startsWith("/company")));
  return (
    <nav aria-label="Primary">
      <ul className={clsx(orientation === "vertical" ? "flex flex-col" : "flex gap-1 overflow-x-auto")}>
        {NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={clsx(
                "block whitespace-nowrap text-sm",
                orientation === "vertical" ? "border-l-2 px-4 py-2" : "border-b-2 px-3 py-2",
                active(n.href) ? "border-cyan bg-raised text-fg" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
