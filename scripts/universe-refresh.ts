/**
 * Rebuild the universe snapshot from a licensed provider and write a dated
 * JSON file. Requires FMP_API_KEY. Point ALTSIGNAL_UNIVERSE_FILE at the output
 * (or replace the bundled file) and re-run `npm run seed`.
 */
import fs from "node:fs";
import { getEnv } from "@/config/env";
import { FmpUniverseProvider } from "@/lib/providers/live/fmp-universe";

const env = getEnv();
if (!env.FMP_API_KEY) {
  console.error("FMP_API_KEY is not set. The bundled sample universe remains in use. See docs/DATA_SOURCES.md.");
  process.exit(1);
}
const snap = await new FmpUniverseProvider(env.FMP_API_KEY).load();
const file = `src/data/universe/universe-${snap.asOf}.json`;
fs.writeFileSync(file, JSON.stringify(snap, null, 1));
console.info(`✓ wrote ${file} (${snap.companies.length} companies). Set ALTSIGNAL_UNIVERSE_FILE=${file}`);
