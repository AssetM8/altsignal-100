"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { COMPONENT_KEYS, COMPONENT_LABELS, DEFAULT_WEIGHTS, type ComponentKey } from "@/config/signal";
import { LAB_FEATURES, LAB_HORIZONS, type LabFeature } from "@/config/lab";
import type { LabResult } from "@/lib/services/lab";
import { IcBars, QuintileBars, SpreadCurve } from "@/components/charts/lazy";
import { EmptyState, Panel, Signed } from "@/components/ui";
import { SOURCE_LABEL, fmtNum, fmtPct } from "@/lib/format";

const SOURCES = ["reddit", "hackernews", "wikipedia", "search", "github"] as const;

export function SignalLab({ sectors, firstDate, lastDate, isSynthetic }: { sectors: string[]; firstDate: string; lastDate: string; isSynthetic: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [features, setFeatures] = useState<LabFeature[]>(["altSignalScore"]);
  const [featureWeights, setFeatureWeights] = useState<Record<string, number>>({});
  const [horizon, setHorizon] = useState<number>(5);
  const [start, setStart] = useState(firstDate);
  const [end, setEnd] = useState(lastDate);
  const [universe, setUniverse] = useState<"all" | "top50" | "top25">("all");
  const [sectorSel, setSectorSel] = useState<string[]>([]);
  const [minConfidence, setMinConfidence] = useState(0);
  const [weights, setWeights] = useState<Record<ComponentKey, number>>({ ...DEFAULT_WEIGHTS });
  const [exclude, setExclude] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LabResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  // Re-open a previous run from ?run=<id>.
  useEffect(() => {
    const id = sp.get("run");
    if (!id || id === runId) return;
    setBusy(true);
    fetch(`/api/signal-lab/${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setResult(j.result);
        setRunId(id);
        // Reflect the stored run's parameters in the form.
        const prm = j.run?.params;
        if (prm) {
          setFeatures(prm.features);
          setHorizon(prm.horizon);
          if (prm.start) setStart(prm.start);
          if (prm.end) setEnd(prm.end);
          setUniverse(prm.universe);
          setSectorSel(prm.sectors ?? []);
          setMinConfidence(prm.minConfidence ?? 0);
          setExclude(prm.excludeSources ?? []);
          if (prm.componentWeights) setWeights({ ...DEFAULT_WEIGHTS, ...prm.componentWeights });
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, [sp, runId]);

  const toggleFeature = (f: LabFeature) =>
    setFeatures((cur) => (cur.includes(f) ? (cur.length > 1 ? cur.filter((x) => x !== f) : cur) : cur.length >= 4 ? cur : [...cur, f]));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        features,
        featureWeights: features.length > 1 ? features.map((f) => featureWeights[f] ?? 1) : undefined,
        componentWeights: features.includes("altSignalScore") ? weights : undefined,
        excludeSources: exclude,
        horizon,
        start,
        end,
        universe,
        sectors: sectorSel,
        minConfidence,
      };
      const r = await fetch("/api/signal-lab/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (HTTP ${r.status})`);
      setResult(j.result);
      setRunId(j.runId);
      const n = new URLSearchParams(sp.toString());
      n.set("run", j.runId);
      router.replace(`${path}?${n}`, { scroll: false });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const box = "border border-line bg-ink px-2 py-1 text-sm text-fg";
  const totalW = COMPONENT_KEYS.reduce((a, k) => a + weights[k], 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <form
        className="space-y-4 self-start border border-line bg-panel p-3"
        onSubmit={(e) => { e.preventDefault(); void run(); }}
        aria-label="Signal Lab settings"
      >
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Features (up to 4)</legend>
          <p className="mb-2 text-2xs text-faint">Several features are combined as a weighted sum of same-day cross-sectional z-scores.</p>
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {(Object.keys(LAB_FEATURES) as LabFeature[]).map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={features.includes(f)} onChange={() => toggleFeature(f)} data-testid={`lab-feature-${f}`} />
                <span className="flex-1">{LAB_FEATURES[f]}</span>
                {features.length > 1 && features.includes(f) ? (
                  <input aria-label={`Weight for ${LAB_FEATURES[f]}`} type="number" step="0.5" min={-5} max={5} value={featureWeights[f] ?? 1} onChange={(e) => setFeatureWeights({ ...featureWeights, [f]: Number(e.target.value) })} className="w-14 border border-line bg-ink px-1 text-xs" />
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-2xs text-muted">Forward horizon
            <select className={box} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} data-testid="lab-horizon">
              {LAB_HORIZONS.map((h) => <option key={h} value={h}>{h} trading day{h > 1 ? "s" : ""}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-2xs text-muted">Universe
            <select className={box} value={universe} onChange={(e) => setUniverse(e.target.value as typeof universe)}>
              <option value="all">All 100</option><option value="top50">Top 50 by cap</option><option value="top25">Top 25 by cap</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-2xs text-muted">From
            <input type="date" className={box} min={firstDate} max={lastDate} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-2xs text-muted">To
            <input type="date" className={box} min={firstDate} max={lastDate} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-2xs text-muted">Minimum data confidence: <span className="num text-fg">{minConfidence}</span>
            <input type="range" min={0} max={80} step={5} value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} />
          </label>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Sectors</legend>
          <div className="flex flex-wrap gap-1">
            {sectors.map((s) => (
              <button key={s} type="button" aria-pressed={sectorSel.includes(s)} onClick={() => setSectorSel((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}
                className={`border border-line px-1.5 py-0.5 text-2xs ${sectorSel.includes(s) ? "bg-cyan/20 text-fg" : "text-muted"}`}>{s}</button>
            ))}
          </div>
          <p className="mt-1 text-2xs text-faint">{sectorSel.length ? `${sectorSel.length} selected` : "None selected means all sectors."}</p>
        </fieldset>

        {features.includes("altSignalScore") ? (
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Composite weights</legend>
            <p className="mb-2 text-2xs text-faint">Normalised to sum to 100%. Changing them recomputes the composite from stored point-in-time features.</p>
            {COMPONENT_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-xs">
                <span className="w-40 truncate" title={COMPONENT_LABELS[k]}>{COMPONENT_LABELS[k].replace(" (tone-signed)", "")}</span>
                <input type="range" min={0} max={0.6} step={0.05} value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} className="flex-1" aria-valuetext={`${Math.round((weights[k] / (totalW || 1)) * 100)}%`} />
                <span className="num w-9 text-right text-muted">{Math.round((weights[k] / (totalW || 1)) * 100)}%</span>
              </label>
            ))}
            <button type="button" className="mt-1 text-2xs text-cyan underline" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>Reset to defaults</button>
            <p className="mb-1 mt-3 text-xs">Exclude sources from the composite</p>
            <div className="flex flex-wrap gap-1">
              {SOURCES.map((s) => (
                <button key={s} type="button" aria-pressed={exclude.includes(s)} onClick={() => setExclude((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length >= 4 ? cur : [...cur, s]))}
                  className={`border border-line px-1.5 py-0.5 text-2xs ${exclude.includes(s) ? "bg-neg/20 text-fg line-through" : "text-muted"}`}>{SOURCE_LABEL[s]}</button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <button type="submit" disabled={busy} className="w-full border border-cyan bg-cyan/15 px-3 py-2 text-sm font-semibold text-fg hover:bg-cyan/25 disabled:opacity-50" data-testid="lab-run">
          {busy ? "Running analysis…" : "Run analysis"}
        </button>
        <p className="text-2xs text-faint">Prices are used here only as forward-return labels, never as signal inputs.{isSynthetic ? " Demo prices are synthetic." : ""}</p>
      </form>

      <div className="min-w-0 space-y-4" aria-live="polite">
        {error ? <div role="alert" className="border border-neg/60 bg-panel p-3 text-sm text-neg">{error}</div> : null}
        {busy && !result ? <div className="skeleton h-96" role="status" aria-label="Running analysis" /> : null}
        {!busy && !result && !error ? (
          <EmptyState title="Choose features and run an analysis">
            The Lab ranks companies by the chosen alternative-data feature each trading day, then measures how those ranks lined up with returns over the next 1–20 trading days, with a held-out test period.
          </EmptyState>
        ) : null}
        {result ? <LabResults r={result} runId={runId} /> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border-b border-r border-line px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-0.5 text-lg font-bold">{value}</dd>
      {hint ? <dd className="text-2xs text-faint">{hint}</dd> : null}
    </div>
  );
}

function LabResults({ r, runId }: { r: LabResult; runId: string | null }) {
  const s = r.summary;
  const n3 = (x: number | null | undefined) => fmtNum(x ?? null, 3);
  const n2 = (x: number | null | undefined) => fmtNum(x ?? null, 2);
  return (
    <div className="space-y-4" data-testid="lab-results">
      <div className={`border-l-4 bg-panel px-4 py-3 ${r.verdict.startsWith("Showed") ? "border-pos" : "border-amber"}`}>
        <p className="text-xs text-muted">Result for {r.featureLabels.join(" + ")}, {r.params.horizon}-day horizon{runId ? `, run ${runId.slice(0, 8)}` : ""}</p>
        <p className="mt-1 text-base font-semibold" data-testid="lab-verdict">{r.verdict}</p>
      </div>

      <dl className="grid grid-cols-2 border-l border-t border-line bg-panel sm:grid-cols-4 2xl:grid-cols-8">
        <Stat label="Mean rank IC" value={<Signed value={s.meanRankIc} digits={3} />} hint="Spearman, all dates" />
        <Stat label="Mean Pearson IC" value={<Signed value={s.meanIc} digits={3} />} />
        <Stat label="t-statistic" value={n2(s.tStat)} hint={`${s.nonOverlappingDates} non-overlapping dates`} />
        <Stat label="95% CI (rank IC)" value={`${n3(s.ciLow)} to ${n3(s.ciHigh)}`} hint={s.bootstrapCiLow !== null ? `Bootstrap ${n3(s.bootstrapCiLow)} to ${n3(s.bootstrapCiHigh)}` : "Bootstrap needs ≥ 8 dates"} />
        <Stat label="Q5 − Q1 spread" value={fmtPct(s.meanSpread, 2)} hint={`t = ${n2(s.spreadTStat)}`} />
        <Stat label="Hit rate" value={fmtPct(s.hitRate, 1)} hint="Signal and return on same side of median" />
        <Stat label="Sample" value={`${s.observations.toLocaleString()}`} hint={`${s.dates} dates, coverage ${fmtPct(r.coverage, 0)}`} />
        <Stat label="Turnover (Q5)" value={fmtPct(r.curve.turnoverTop, 0)} hint={`Max drawdown ${fmtPct(r.curve.maxDrawdown, 1)}`} />
      </dl>

      <Panel title="Calibration, validation and held-out test" note="Chronological 60/20/20 split of rebalance dates. Weights are never tuned on the test period; the verdict above uses the test period.">
        <div className="overflow-x-auto">
          <table className="grid-table">
            <thead><tr><th>Period</th><th>Dates</th><th className="r">Mean rank IC</th><th className="r">t-stat</th><th className="r">Q5 − Q1</th><th className="r">Hit rate</th><th className="r">Share of positive-IC days</th></tr></thead>
            <tbody>
              {(["calibration", "validation", "test"] as const).map((k) => {
                const x = r.splits[k] as typeof s & { start: string | null; end: string | null };
                return (
                  <tr key={k}>
                    <th scope="row" className="!font-normal">{k === "test" ? "Test (held out)" : k === "calibration" ? "Calibration" : "Validation"}</th>
                    <td className="num text-muted">{x.start} to {x.end}</td>
                    <td className="r"><Signed value={x.meanRankIc} digits={3} /></td>
                    <td className="r num">{n2(x.tStat)}</td>
                    <td className="r num">{fmtPct(x.meanSpread, 2)}</td>
                    <td className="r num">{fmtPct(x.hitRate, 1)}</td>
                    <td className="r num">{fmtPct(x.positiveIcShare, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 2xl:grid-cols-2">
        <Panel title="Daily rank IC" note="Spearman correlation between the signal and the next-horizon return, per trading day. Consecutive bars overlap when horizon > 1.">
          <IcBars data={r.icSeries} />
        </Panel>
        <Panel title="Forward return by signal quintile" note={`Q1 = lowest signal, Q5 = highest. Pooled ${r.params.horizon}-day returns from the next trading close.`}>
          <QuintileBars data={r.quintiles} />
          <table className="grid-table mt-2">
            <thead><tr><th>Quintile</th><th className="r">Mean</th><th className="r">Median</th><th className="r">Obs.</th></tr></thead>
            <tbody>{r.quintiles.map((q) => <tr key={q.quintile}><td>Q{q.quintile}</td><td className="r num">{fmtPct(q.mean, 2)}</td><td className="r num">{fmtPct(q.median, 2)}</td><td className="r num">{q.n}</td></tr>)}</tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Cumulative long-short research spread" note="Equal-weight Q5 minus Q1, compounded on non-overlapping rebalances, before costs. A research diagnostic, not a strategy.">
        {r.curve.points.length ? <SpreadCurve data={r.curve.points} /> : <EmptyState title="Not enough rebalances" />}
      </Panel>

      <div className="grid gap-4 2xl:grid-cols-2">
        <Panel title="Walk-forward (expanding window)" note={`At each fold the sign${r.params.features.length > 1 ? " and the best single feature" : ""} is chosen on all earlier dates, then scored on the next fold only. Out-of-sample mean rank IC: ${n3(r.walkForward.oosMeanRankIc)}.`}>
          {r.walkForward.folds.length ? (
            <table className="grid-table">
              <thead><tr><th>Fold</th><th>Chosen</th><th className="r">Train IC</th><th className="r">Out-of-sample IC</th></tr></thead>
              <tbody>{r.walkForward.folds.map((f) => <tr key={f.start}><td className="num">{f.start} to {f.end}</td><td>{f.sign < 0 ? "−" : ""}{f.chosen}</td><td className="r num">{n3(f.trainIc)}</td><td className="r"><Signed value={f.testIc} digits={3} /></td></tr>)}</tbody>
            </table>
          ) : <EmptyState title="Too few dates for walk-forward" />}
        </Panel>
        <Panel title="Baselines on the same sample" note="A useful feature should beat a seeded random signal and the attention-only baseline.">
          <table className="grid-table">
            <thead><tr><th>Baseline</th><th className="r">Mean rank IC</th><th className="r">t-stat</th><th className="r">Q5 − Q1</th></tr></thead>
            <tbody>
              <tr className="font-semibold"><td>Your signal</td><td className="r"><Signed value={s.meanRankIc} digits={3} /></td><td className="r num">{n2(s.tStat)}</td><td className="r num">{fmtPct(s.meanSpread, 2)}</td></tr>
              {r.baselines.map((b) => <tr key={b.name}><td>{b.name}</td><td className="r"><Signed value={b.meanRankIc} digits={3} /></td><td className="r num">{n2(b.tStat)}</td><td className="r num">{fmtPct(b.meanSpread, 2)}</td></tr>)}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid gap-4 2xl:grid-cols-3">
        <Panel title="By sector" note="Within-sector rank IC; sectors need ≥ 6 names per date.">
          {r.bySector.length ? (
            <table className="grid-table">
              <thead><tr><th>Sector</th><th className="r">Dates</th><th className="r">Rank IC</th><th className="r">t</th></tr></thead>
              <tbody>{r.bySector.map((g) => <tr key={g.group}><td>{g.group}</td><td className="r num">{g.dates}</td><td className="r"><Signed value={g.meanRankIc} digits={3} /></td><td className="r num">{n2(g.tStat)}</td></tr>)}</tbody>
            </table>
          ) : <EmptyState title="No sector has enough names" />}
        </Panel>
        <Panel title="By month and regime" note="Regime splits days by whether universe-average sentiment was above its median.">
          <table className="grid-table">
            <thead><tr><th>Period</th><th className="r">Dates</th><th className="r">Rank IC</th><th className="r">t</th></tr></thead>
            <tbody>
              {r.byMonth.map((g) => <tr key={g.group}><td className="num">{g.group}</td><td className="r num">{g.dates}</td><td className="r"><Signed value={g.meanRankIc} digits={3} /></td><td className="r num">{n2(g.tStat)}</td></tr>)}
              {r.regimes.map((g) => <tr key={g.group}><td>{g.group}</td><td className="r num">{g.dates}</td><td className="r"><Signed value={g.meanRankIc} digits={3} /></td><td className="r num">{n2(g.tStat)}</td></tr>)}
            </tbody>
          </table>
        </Panel>
        <Panel title="Sensitivity" note="Minimum confidence acts as a minimum-sample-size filter. Source removal recomputes the composite without one source.">
          <table className="grid-table">
            <thead><tr><th>Variant</th><th className="r">Rank IC</th><th className="r">t</th></tr></thead>
            <tbody>
              {r.sensitivity.confidence.map((c) => <tr key={`c${c.minConfidence}`}><td>Confidence ≥ {c.minConfidence}</td><td className="r"><Signed value={c.meanRankIc} digits={3} /></td><td className="r num">{n2(c.tStat)}</td></tr>)}
              {r.sensitivity.sourceRemoval.map((c) => <tr key={c.removed}><td>Without {SOURCE_LABEL[c.removed]}</td><td className="r"><Signed value={c.meanRankIc} digits={3} /></td><td className="r num">{n2(c.tStat)}</td></tr>)}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Integrity checks and limitations">
        <ul className="space-y-1 text-sm">
          <li>{r.integrity.labelsEnteringAfterSignal ? "Passed" : "FAILED"}: all {r.integrity.labelsChecked.toLocaleString()} labels enter on a trading day after the signal date.</li>
          <li>{r.integrity.noFutureObservationsInFeatures ? "Passed" : "FAILED"}: none of {r.integrity.featureRowsChecked.toLocaleString()} feature rows uses an observation dated after its signal date.</li>
          <li className="text-muted">{r.integrity.timezone}</li>
          <li className="text-muted">Model: {r.integrity.modelVersion}. Run took {(r.durationMs / 1000).toFixed(1)}s.</li>
        </ul>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
          {r.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      </Panel>
    </div>
  );
}
