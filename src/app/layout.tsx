import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { PRODUCT } from "@/config/product";
import { Nav } from "@/components/shell/nav";
import { StockSearch } from "@/components/shell/search";
import { StateBadge } from "@/components/ui";
import { getDataset, DatasetNotReadyError } from "@/lib/services/dataset";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: { default: PRODUCT.name, template: `%s | ${PRODUCT.name}` },
  description: PRODUCT.tagline,
};
export const viewport: Viewport = { themeColor: "#0c1424" };
export const dynamic = "force-dynamic";

async function shellData() {
  try {
    const ds = await getDataset();
    return { ok: true as const, ds };
  } catch (e) {
    return { ok: false as const, error: e instanceof DatasetNotReadyError ? e.message : "The analytics database could not be read." };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const data = await shellData();
  const items = data.ok ? data.ds.companies.map((c) => ({ ticker: c.ticker, name: c.name, sector: c.sector })) : [];
  const states = data.ok ? data.ds.sources.map((s) => s.state) : [];
  const overall = !data.ok ? "unavailable" : states.every((s) => s === "live") ? "live" : states.some((s) => s === "unavailable" || s === "stale") ? "stale" : "demo";
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-raised focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <aside className="hidden w-56 shrink-0 border-r border-line bg-panel lg:flex lg:flex-col">
            <Link href="/" className="block border-b border-line px-4 py-4">
              <span className="block text-lg font-bold tracking-tight">{PRODUCT.name}</span>
              <span className="mt-0.5 block text-2xs text-faint">Alternative-data research</span>
            </Link>
            <div className="py-3">
              <Nav orientation="vertical" />
            </div>
            {data.ok ? (
              <div className="mt-auto border-t border-line px-4 py-3 text-2xs text-muted">
                <p className="mb-1.5 text-xs font-semibold text-fg">Sources</p>
                <ul className="space-y-1">
                  {data.ds.sources.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span>{s.name}</span>
                      <StateBadge state={s.state} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b border-line bg-ink/95 backdrop-blur">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                <Link href="/" className="text-base font-bold lg:hidden">
                  {PRODUCT.name}
                </Link>
                {data.ok && data.ds.meta.isSynthetic ? (
                  <span data-testid="demo-badge" className="border border-amber bg-amber/15 px-2 py-0.5 text-xs font-bold text-amber" title="Every number on this site comes from deterministic synthetic fixtures">
                    DEMO DATA — synthetic, not real observations
                  </span>
                ) : null}
                <div className="flex items-center gap-2 text-xs text-muted">
                  <StateBadge state={overall} />
                  {data.ok ? (
                    <span className="num">
                      Data as of {data.ds.meta.asOf}, refreshed {fmtDateTime(data.ds.meta.lastRefreshAt)}
                    </span>
                  ) : null}
                </div>
                <div className="ml-auto w-full sm:w-auto">
                  <StockSearch items={items} />
                </div>
              </div>
              <div className="border-t border-line-soft lg:hidden">
                <Nav orientation="horizontal" />
              </div>
            </header>
            <main id="main" className="min-w-0 flex-1 px-3 py-4 sm:px-5">
              {data.ok ? (
                children
              ) : (
                <div className="mx-auto max-w-xl border border-neg/50 bg-panel p-6">
                  <h1 className="text-lg font-semibold">The database is not ready</h1>
                  <p className="mt-2 text-sm text-muted">{data.error}</p>
                  <pre className="mt-4 bg-ink p-3 text-xs">npm run setup</pre>
                </div>
              )}
            </main>
            <footer className="border-t border-line px-5 py-3 text-2xs text-faint">{PRODUCT.disclaimer}</footer>
          </div>
        </div>
      </body>
    </html>
  );
}
