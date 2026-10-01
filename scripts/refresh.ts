/**
 * Incremental refresh: re-fetch the last N days (default 3) from every
 * available provider, then recompute point-in-time features and signals.
 *   npm run refresh -- --days 7
 */
import { getDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { runIngestion } from "@/lib/pipeline/ingest";
import { getEnv } from "@/config/env";
import { DEMO_AS_OF } from "@/lib/providers/fixtures/world";
import { addDays } from "@/lib/util/dates";

const idx = process.argv.indexOf("--days");
const days = Math.max(1, Math.min(60, Number(idx > 0 ? process.argv[idx + 1] : 3) || 3));
const env = getEnv();
const end = env.ALTSIGNAL_MODE === "demo" ? DEMO_AS_OF : addDays(new Date().toISOString().slice(0, 10), -1);
await runMigrations();
const s = await runIngestion({ db: getDb(), env, start: addDays(end, -(days - 1)), end, log: (m) => console.info(m) });
console.info(`✓ refreshed ${days} day(s) in ${(s.durationMs / 1000).toFixed(1)}s`);
