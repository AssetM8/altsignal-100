/**
 * Integration: fixture providers → ingestion → database → signals → API routes → Signal Lab.
 * Uses its own SQLite file and a 120-day ingestion window to keep runtime modest.
 */
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_FILE = "data/test-integration.db";
process.env.DATABASE_URL = `file:./${DB_FILE}`;
process.env.ALTSIGNAL_MODE = "demo";
process.env.ALTSIGNAL_DISABLED_PROVIDERS = "";
process.env.ADMIN_TOKEN = "test-admin-token";

const { getDb, getClient, closeDb } = await import("@/lib/db/client");
const { runMigrations } = await import("@/lib/db/migrate");
const { runIngestion } = await import("@/lib/pipeline/ingest");
const { invalidateDataset, getDataset } = await import("@/lib/services/dataset");
const { DEMO_AS_OF } = await import("@/lib/providers/fixtures/world");
const { addDays } = await import("@/lib/util/dates");

const START = addDays(DEMO_AS_OF, -119);
const q = async (sql: string) => (await getClient().execute(sql)).rows;

beforeAll(async () => {
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
  await runMigrations();
  await runIngestion({ db: getDb(), start: START, end: DEMO_AS_OF, reset: true });
  invalidateDataset();
}, 300_000);

afterAll(() => closeDb());

describe("provider → database ingestion", () => {
  it("stores the 100-company dated universe with ticker history", async () => {
    expect((await q("select count(*) n from companies"))[0]?.n).toBe(100);
    const snap = (await q("select as_of, is_live from universe_snapshots"))[0];
    expect(snap).toMatchObject({ as_of: "2026-06-30", is_live: 0 });
    expect((await q("select count(*) n from securities where ticker = 'FB' and valid_to is not null"))[0]?.n).toBe(1);
  });

  it("labels every stored row as synthetic in demo mode", async () => {
    expect((await q("select count(*) n from daily_source_metrics where is_synthetic = 0"))[0]?.n).toBe(0);
    expect((await q("select count(*) n from source_documents where is_synthetic = 0"))[0]?.n).toBe(0);
    expect((await q("select value from dataset_meta where key='isSynthetic'"))[0]?.value).toBe("true");
  });

  it("keeps outage days missing instead of zero-filling them, and logs the gap", async () => {
    const outage = addDays(DEMO_AS_OF, -72); // inside the simulated Hacker News outage
    expect((await q(`select count(*) n from daily_source_metrics where source_id='hackernews' and date='${outage}'`))[0]?.n).toBe(0);
    expect(Number((await q(`select count(*) n from daily_source_metrics where source_id='hackernews' and date='${addDays(outage, -10)}'`))[0]?.n)).toBe(100);
    expect(Number((await q("select count(*) n from data_quality_events where source_id='hackernews' and kind='coverage_gap'"))[0]?.n)).toBeGreaterThan(0);
  });

  it("marks the lagging search fixture as stale", async () => {
    expect((await q("select state from data_sources where id='search'"))[0]?.state).toBe("stale");
  });

  it("records an auditable mention trail with match reasons and model versions", async () => {
    const reasons = (await q("select distinct best_reason r from company_mentions")).map((r) => r.r);
    expect(reasons).toEqual(expect.arrayContaining(["cashtag", "name", "ticker"]));
    expect(Number((await q("select count(*) n from sentiment_results s join model_versions m on m.id = s.model_version_id where m.name='altsignal-lexicon'"))[0]?.n)).toBeGreaterThan(100);
    // Retention: nothing older than 45 days is stored.
    expect(String((await q("select min(published_date) d from source_documents"))[0]?.d) >= addDays(DEMO_AS_OF, -44)).toBe(true);
  });

  it("computes a signal for every company on the as-of date", async () => {
    const rows = await q(`select count(*) n, count(alt_signal_score) scored from daily_company_signals where date='${DEMO_AS_OF}'`);
    expect(rows[0]?.n).toBe(100);
    expect(Number(rows[0]?.scored)).toBeGreaterThan(90);
  });

  it("is idempotent: re-ingesting a recent window does not duplicate rows", async () => {
    const before = (await q("select count(*) n from daily_source_metrics"))[0]?.n;
    await runIngestion({ db: getDb(), start: addDays(DEMO_AS_OF, -2), end: DEMO_AS_OF });
    invalidateDataset();
    expect((await q("select count(*) n from daily_source_metrics"))[0]?.n).toBe(before);
  }, 120_000);
});

describe("API routes", () => {
  it("GET /api/overview validates input and returns analytics", async () => {
    const { GET } = await import("@/app/api/overview/route");
    const ok = await GET(new Request("http://x/api/overview?window=7"));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.kpis.universe).toBe(100);
    expect(body.meta.isSynthetic).toBe(true);
    expect(body.moodSeries).toHaveLength(7);
    const bad = await GET(new Request("http://x/api/overview?window=13"));
    expect(bad.status).toBe(400);
  });

  it("GET /api/stocks returns 100 rows and a labelled CSV", async () => {
    const { GET } = await import("@/app/api/stocks/route");
    const j = await (await GET(new Request("http://x/api/stocks"))).json();
    expect(j.rows).toHaveLength(100);
    const csv = await (await GET(new Request("http://x/api/stocks?format=csv"))).text();
    expect(csv.split("\n")[1]).toContain("DEMO DATA");
    expect(csv).toContain("NVDA");
  });

  it("GET /api/stocks/:ticker resolves previous tickers and 404s unknown ones", async () => {
    const { GET } = await import("@/app/api/stocks/[ticker]/route");
    const ok = await GET(new Request("http://x"), { params: Promise.resolve({ ticker: "fb" }) });
    expect((await ok.json()).company.ticker).toBe("META");
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ ticker: "ZZZZ" }) })).status).toBe(404);
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ ticker: "<script>" }) })).status).toBe(400);
  });

  it("GET signals/sources/sectors/data-status/universe respond", async () => {
    const sig = await (await import("@/app/api/stocks/[ticker]/signals/route")).GET(new Request(`http://x?start=${addDays(DEMO_AS_OF, -6)}`), { params: Promise.resolve({ ticker: "NVDA" }) });
    expect((await sig.json()).signals).toHaveLength(7);
    const src = await (await import("@/app/api/stocks/[ticker]/sources/route")).GET(new Request("http://x?days=7"), { params: Promise.resolve({ ticker: "NVDA" }) });
    expect((await src.json()).metrics.length).toBeGreaterThan(10);
    expect((await (await (await import("@/app/api/sectors/route")).GET()).json()).sectors.length).toBeGreaterThan(5);
    expect((await (await (await import("@/app/api/data-status/route")).GET()).json()).sources).toHaveLength(5);
    expect((await (await (await import("@/app/api/universe/route")).GET()).json()).companies).toHaveLength(100);
  });

  it("protects the admin refresh route", async () => {
    const { POST } = await import("@/app/api/admin/refresh/route");
    expect((await POST(new Request("http://x", { method: "POST" }))).status).toBe(401);
    expect((await POST(new Request("http://x", { method: "POST", headers: { authorization: "Bearer wrong-token-xx" } }))).status).toBe(401);
  });
});

describe("Signal Lab", () => {
  it("runs, persists and reloads an analysis with integrity checks", async () => {
    const { POST } = await import("@/app/api/signal-lab/run/route");
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ features: ["sentimentChange"], horizon: 5 }) }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.result.summary.dates).toBeGreaterThan(20);
    expect(j.result.integrity).toMatchObject({ labelsEnteringAfterSignal: true, noFutureObservationsInFeatures: true });
    expect(j.result.verdict).toMatch(/^(Showed|Did not demonstrate)/);
    expect(j.result.warnings.join(" ")).toMatch(/Survivorship/);
    const { GET } = await import("@/app/api/signal-lab/[runId]/route");
    const again = await (await GET(new Request("http://x"), { params: Promise.resolve({ runId: j.runId }) })).json();
    expect(again.result.summary.meanRankIc).toBe(j.result.summary.meanRankIc);
  }, 120_000);

  it("rejects invalid parameters", async () => {
    const { POST } = await import("@/app/api/signal-lab/run/route");
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ features: ["closePrice"], horizon: 3 }) }));
    expect(res.status).toBe(400);
  });

  it("recomputes the composite with custom weights and without a source", async () => {
    const { runSignalLab } = await import("@/lib/services/lab");
    const r = await runSignalLab({ features: ["altSignalScore"], horizon: 5, componentWeights: { sentiment: 1, abnormalAttention: 0, attentionAcceleration: 0, sentimentAcceleration: 0, confirmation: 0, unusualSource: 0 }, excludeSources: ["github"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.componentWeights.sentiment).toBe(1);
      expect(r.result.sensitivity.sourceRemoval.map((x) => x.removed)).not.toContain("github");
    }
  }, 180_000);
});

describe("graceful degradation", () => {
  it("drops a runtime-disabled provider without crashing", async () => {
    process.env.ALTSIGNAL_DISABLED_PROVIDERS = "hackernews";
    try {
      const ds = await getDataset();
      expect(ds.sources.find((s) => s.id === "hackernews")?.state).toBe("unavailable");
      const today = ds.signals.get(ds.meta.asOf);
      expect(Array.from(today?.values() ?? []).some((s) => s.sourcesAvailable.includes("hackernews"))).toBe(false);
      const { GET } = await import("@/app/api/overview/route");
      expect((await GET(new Request("http://x/api/overview"))).status).toBe(200);
    } finally {
      process.env.ALTSIGNAL_DISABLED_PROVIDERS = "";
    }
  }, 120_000);
});
