import type { Metadata } from "next";
import { getDataStatus } from "@/lib/services/views";
import { EmptyState, Panel, StateBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Data status" };
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const s = await getDataStatus();
  const m = s.meta;
  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div>
        <h1 className="text-xl font-bold">Data status</h1>
        <p className="text-sm text-muted">What is loaded, where it came from, how fresh it is and what went wrong. Settings are read from environment variables; see .env.example.</p>
      </div>

      <dl className="grid grid-cols-2 border-l border-t border-line bg-panel md:grid-cols-4">
        {[
          ["Mode", m.mode === "demo" ? "Demo (synthetic fixtures)" : "Live"],
          ["Data as of", `${m.asOf} (UTC day)`],
          ["Last refresh", fmtDateTime(m.lastRefreshAt)],
          ["History", `${s.counts.firstDate} to ${s.counts.lastDate} (${s.counts.dates} days)`],
          ["Universe", `${s.counts.companies} companies, ${m.universeProvider} as of ${m.universeAsOf}${m.universeIsLive ? "" : " (not live)"}`],
          ["Outcome labels", m.pricesAvailable ? (m.pricesSynthetic ? "Synthetic demo prices" : "Licensed price provider") : "None configured"],
          ["Composite model", m.compositeModel],
          ["Text classifier", m.classifierModel],
        ].map(([k, v]) => (
          <div key={k} className="border-b border-r border-line px-3 py-2">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="text-sm">{v}</dd>
          </div>
        ))}
      </dl>
      {m.runtimeDisabled.length ? <p role="note" className="border-l-2 border-amber bg-panel px-3 py-2 text-sm">Disabled at runtime: {m.runtimeDisabled.join(", ")}. Scores are recomputed without these sources.</p> : null}

      <Panel title="Sources" note="Coverage is the number of companies for which the source contributed to today's score. Rate limits and licences are the assumptions documented in DATA_SOURCES.md.">
        <div className="overflow-x-auto">
          <table className="grid-table" data-testid="status-sources">
            <thead>
              <tr><th>Source</th><th>Status</th><th>Adapter</th><th>Latest data</th><th>Last success</th><th className="r">Coverage</th><th>Credentials</th><th>Rate limit</th><th>Reason / note</th></tr>
            </thead>
            <tbody>
              {s.sources.map((x) => (
                <tr key={x.id}>
                  <td className="font-semibold">{x.name}</td>
                  <td><StateBadge state={x.state} /></td>
                  <td className="text-muted">{x.implementation === "fixture" ? "Fixture (same schema as live)" : "Live API"}</td>
                  <td className="num">{x.latestDataDate ?? "—"}</td>
                  <td className="num text-muted">{fmtDateTime(x.lastSuccessAt)}</td>
                  <td className="r num">{x.coverage}</td>
                  <td className="text-xs text-muted">{x.descriptor.requiredEnv?.length ? x.descriptor.requiredEnv.join(", ") : "None"}</td>
                  <td className="whitespace-normal text-xs text-muted">{x.descriptor.rateLimit?.notes}</td>
                  <td className="whitespace-normal text-xs text-muted">{x.stateReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent ingestion runs">
          {s.runs.length ? (
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead><tr><th>#</th><th>Source</th><th>Status</th><th>Range</th><th className="r">Docs in</th><th className="r">Kept</th><th className="r">Obs.</th><th>Finished</th></tr></thead>
                <tbody>
                  {s.runs.map((r) => (
                    <tr key={r.id}>
                      <td className="num text-muted">{r.id}</td>
                      <td>{r.sourceId}</td>
                      <td className={r.status === "succeeded" ? "text-pos" : "text-neg"}>{r.status}</td>
                      <td className="num text-xs">{r.rangeStart} to {r.rangeEnd}</td>
                      <td className="r num">{r.documentsIn.toLocaleString()}</td>
                      <td className="r num">{r.documentsKept.toLocaleString()}</td>
                      <td className="r num">{r.observations.toLocaleString()}</td>
                      <td className="num text-xs text-muted">{fmtDateTime(r.finishedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No ingestion runs yet">Run npm run seed.</EmptyState>}
        </Panel>
        <Panel title="Data-quality events" note="Coverage gaps are recorded, never zero-filled.">
          {s.quality.length ? (
            <ul className="divide-y divide-line-soft text-sm">
              {s.quality.map((q) => (
                <li key={q.id} className="flex gap-3 py-1.5">
                  <span className={`w-16 shrink-0 text-xs ${q.severity === "warning" ? "text-amber" : "text-muted"}`}>{q.severity}</span>
                  <span className="w-24 shrink-0 text-xs text-muted">{q.sourceId ?? "—"}</span>
                  <span className="min-w-0 flex-1"><span className="text-xs text-faint">{q.kind}: </span>{q.message}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No quality events" />}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Model versions">
          <table className="grid-table">
            <thead><tr><th>Kind</th><th>Name</th><th>Version</th><th>Description</th></tr></thead>
            <tbody>{s.models.map((mv) => <tr key={mv.id}><td>{mv.kind}</td><td>{mv.name}</td><td className="num">{mv.version}</td><td className="whitespace-normal text-xs text-muted">{mv.description}</td></tr>)}</tbody>
          </table>
        </Panel>
        <Panel title="Universe snapshots">
          <table className="grid-table">
            <thead><tr><th>As of</th><th>Provider</th><th>Live</th><th>Description</th></tr></thead>
            <tbody>{s.universe.map((u) => <tr key={u.id}><td className="num">{u.asOf}</td><td>{u.provider}</td><td>{u.isLive ? "Yes" : "No"}</td><td className="whitespace-normal text-xs text-muted">{u.description}</td></tr>)}</tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
