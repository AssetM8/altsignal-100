import { UniverseSnapshotSchema, type UniverseProvider, type UniverseSnapshot } from "../types";
import { getJson, type FetchLike } from "./http";

interface FmpScreenerRow {
  symbol: string;
  companyName: string;
  marketCap: number;
  sector: string | null;
  industry: string | null;
  exchangeShortName: string;
  country: string | null;
  isEtf: boolean;
  isFund: boolean;
  isActivelyTrading: boolean;
}

/** Duplicate share classes we keep only one of (first listed wins). */
const DUPLICATE_CLASSES: Record<string, string> = { GOOG: "GOOGL", "BRK-A": "BRK.B", "BRK.A": "BRK.B", FOXA: "FOX", NWS: "NWSA" };

/**
 * Live universe adapter for Financial Modeling Prep's stock screener
 * (requires FMP_API_KEY and a plan that permits this use). Applies the same
 * selection rules as the bundled sample. Untested against the live API from
 * the build sandbox; covered by a recorded-shape unit test.
 */
export class FmpUniverseProvider implements UniverseProvider {
  readonly id = "fmp";
  readonly isLive = true;
  constructor(private readonly apiKey: string, private readonly fetchImpl: FetchLike = fetch) {}

  async load(): Promise<UniverseSnapshot> {
    if (!this.apiKey) throw new Error("FMP_API_KEY is not set");
    const url = `https://financialmodelingprep.com/api/v3/stock-screener?country=US&isEtf=false&isFund=false&isActivelyTrading=true&marketCapMoreThan=20000000000&limit=1000&apikey=${encodeURIComponent(this.apiKey)}`;
    const rows = await getJson<FmpScreenerRow[]>(this.fetchImpl, url, { Accept: "application/json" });
    return selectUniverse(rows, new Date().toISOString().slice(0, 10));
  }
}

export function selectUniverse(rows: FmpScreenerRow[], asOf: string): UniverseSnapshot {
  const seen = new Set<string>();
  const kept = rows
    .filter((r) => !r.isEtf && !r.isFund && r.isActivelyTrading && r.country === "US")
    .filter((r) => ["NYSE", "NASDAQ"].includes(r.exchangeShortName))
    .filter((r) => !/(acquisition corp|warrant|preferred|\bunits?\b|trust$)/i.test(r.companyName))
    .filter((r) => !/[-.](W|WS|U|P[A-Z]?)$/.test(r.symbol))
    .map((r) => ({ ...r, symbol: r.symbol.replace("-", ".") }))
    .sort((a, b) => b.marketCap - a.marketCap)
    .filter((r) => {
      const canon = DUPLICATE_CLASSES[r.symbol] ?? r.symbol;
      const issuer = canon === r.symbol ? r.companyName.replace(/ Class [A-Z]$/i, "") : canon;
      if (seen.has(issuer) || seen.has(canon)) return false;
      seen.add(issuer);
      seen.add(canon);
      return true;
    })
    .slice(0, 100);
  return UniverseSnapshotSchema.parse({
    schemaVersion: 1,
    asOf,
    isLive: true,
    provider: "financialmodelingprep",
    description: `Top 100 US-listed operating companies by market cap from FMP screener on ${asOf}.`,
    selectionRules: "country=US, NYSE/NASDAQ, no ETFs/funds/SPACs/warrants/preferreds/units, one share class per issuer",
    companies: kept.map((r, i) => ({
      rank: i + 1,
      ticker: r.symbol,
      name: r.companyName,
      exchange: r.exchangeShortName,
      sector: r.sector ?? "Unknown",
      industry: r.industry ?? "Unknown",
      marketCapUsd: r.marketCap,
      securityType: "common",
      shareClass: null,
      previousIdentifiers: [],
    })),
  });
}
