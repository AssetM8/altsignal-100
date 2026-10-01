import fs from "node:fs";
import path from "node:path";
import { ENTITY_OVERRIDES, AMBIGUOUS_TICKERS } from "@/data/entities";
import {
  UniverseSnapshotSchema,
  type CompanyEntity,
  type UniverseCompany,
  type UniverseProvider,
  type UniverseSnapshot,
} from "./types";

export const DEFAULT_UNIVERSE_FILE = "src/data/universe/sample-universe-2026-06-30.json";

/** Loads a dated universe snapshot from a JSON file (bundled or produced by universe:refresh). */
export class FileUniverseProvider implements UniverseProvider {
  readonly id = "file";
  readonly isLive = false;
  constructor(private readonly file = process.env.ALTSIGNAL_UNIVERSE_FILE || DEFAULT_UNIVERSE_FILE) {}
  async load(): Promise<UniverseSnapshot> {
    const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), this.file), "utf8"));
    return UniverseSnapshotSchema.parse(raw);
  }
}

const SUFFIX = /,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.?|plc|Ltd\.?|Holdings|Group|& Co\.?)$/i;

export function shortNameFromOfficial(name: string): string {
  let s = name.replace(/^The\s+/i, "");
  for (let i = 0; i < 3; i++) s = s.replace(SUFFIX, "").trim();
  return s;
}

export function buildEntity(c: UniverseCompany): CompanyEntity {
  const o = ENTITY_OVERRIDES[c.ticker] ?? {};
  const derived = shortNameFromOfficial(c.name);
  const shortNames = Array.from(new Set([...(o.shortNames ?? []), derived])).filter((s) => s.length >= 3);
  return {
    ticker: c.ticker,
    cashtag: `$${c.ticker}`,
    officialName: c.name,
    shortNames,
    products: o.products ?? [],
    subsidiaries: o.subsidiaries ?? [],
    misspellings: o.misspellings ?? [],
    exclusions: (o.exclusions ?? []).map((e) => e.toLowerCase()),
    ambiguousAliases: o.ambiguousAliases ?? [],
    ambiguousTicker: AMBIGUOUS_TICKERS.has(c.ticker) || c.ticker.length <= 2,
    previousTickers: c.previousIdentifiers.map((p) => p.ticker).filter((t) => t !== c.ticker),
    wikipediaTitle: o.wikipediaTitle ?? null,
    githubOrgs: o.githubOrgs ?? [],
    searchTerm: o.searchTerm ?? derived,
    sector: c.sector,
  };
}

export function buildEntities(snapshot: UniverseSnapshot): CompanyEntity[] {
  return snapshot.companies.map(buildEntity);
}
