/**
 * Seed the database. In demo mode (default) this ingests the deterministic
 * SYNTHETIC fixtures for every source over the full history window.
 *   npm run seed            # demo fixtures
 *   ALTSIGNAL_MODE=live npm run seed   # live adapters where available
 */
import { getDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { runIngestion } from "@/lib/pipeline/ingest";

await runMigrations();
const summary = await runIngestion({ db: getDb(), reset: true, log: (m) => console.info(m) });
console.info(`✓ seed complete in ${(summary.durationMs / 1000).toFixed(1)}s — as of ${summary.asOf} (${summary.mode})`);
