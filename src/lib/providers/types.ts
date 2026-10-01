import { z } from "zod";
import type { SourceId } from "@/config/signal";

/* ─────────────────────── Universe ─────────────────────── */

export const UniverseCompanySchema = z.object({
  rank: z.number().int().positive(),
  ticker: z.string().min(1).max(10),
  name: z.string().min(1),
  exchange: z.string(),
  sector: z.string(),
  industry: z.string(),
  marketCapUsd: z.number().positive(),
  securityType: z.literal("common"),
  shareClass: z.string().nullable(),
  previousIdentifiers: z.array(z.object({ ticker: z.string(), until: z.string(), name: z.string().optional() })),
});
export type UniverseCompany = z.infer<typeof UniverseCompanySchema>;

export const UniverseSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isLive: z.boolean(),
  provider: z.string(),
  description: z.string(),
  selectionRules: z.string(),
  companies: z.array(UniverseCompanySchema).length(100),
});
export type UniverseSnapshot = z.infer<typeof UniverseSnapshotSchema>;

export interface UniverseProvider {
  readonly id: string;
  readonly isLive: boolean;
  load(): Promise<UniverseSnapshot>;
}

/* ─────────────────────── Alternative data ─────────────────────── */

/** A public item (post, comment, story). Author is stored only as a salted hash. */
export const RawDocumentSchema = z.object({
  sourceId: z.string(),
  externalId: z.string(),
  url: z.string().url().nullable(),
  community: z.string().nullable(),
  authorHash: z.string().nullable(),
  title: z.string().default(""),
  body: z.string().default(""),
  publishedAt: z.string().datetime(),
  collectedAt: z.string().datetime(),
  engagement: z.object({ score: z.number(), comments: z.number() }),
  isSynthetic: z.boolean(),
});
export type RawDocument = z.infer<typeof RawDocumentSchema>;

/** A numeric daily observation (page views, search index, developer events…). */
export const NumericObservationSchema = z.object({
  sourceId: z.string(),
  ticker: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().nonnegative(),
  collectedAt: z.string().datetime(),
  isSynthetic: z.boolean(),
  meta: z.record(z.union([z.string(), z.number()])).optional(),
});
export type NumericObservation = z.infer<typeof NumericObservationSchema>;

export type ProviderKind = "text" | "numeric";
export type ProviderState = "live" | "demo" | "stale" | "unavailable";

export interface ProviderDescriptor {
  id: SourceId;
  name: string;
  kind: ProviderKind;
  implementation: "live" | "fixture";
  description: string;
  /** How far back the source can return history, in days (null = unbounded). */
  supportedHistoryDays: number | null;
  refreshFrequency: string;
  rateLimit: { requests: number; perSeconds: number; notes: string };
  license: string;
  requiredEnv: string[];
  homepage: string;
  knownBiases: string[];
}

export interface ProviderStatus {
  state: ProviderState;
  reason: string | null;
}

export interface FetchRequest {
  companies: CompanyEntity[];
  /** Inclusive UTC date keys. */
  start: string;
  end: string;
}

export interface ProviderBatch {
  sourceId: SourceId;
  documents: RawDocument[];
  observations: NumericObservation[];
  fetchedAt: string;
  /** UTC days the source was actually collected for (if the provider knows). */
  coveredDates?: string[];
  quality: {
    requested: number;
    received: number;
    errors: string[];
  };
}

/** The contract every live or fixture alt-data source implements. */
export interface AlternativeDataProvider {
  readonly descriptor: ProviderDescriptor;
  status(): ProviderStatus;
  fetch(req: FetchRequest): Promise<ProviderBatch>;
}

/* ─────────────────────── Market data (outcome labels only) ─────────────────────── */

export interface PriceBar {
  ticker: string;
  date: string;
  close: number;
  isSynthetic: boolean;
}

/**
 * Prices are used ONLY for display context and retrospective validation
 * (forward-return labels). The signal pipeline has no import path to this.
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly isLive: boolean;
  getDailyCloses(tickers: string[], start: string, end: string): Promise<PriceBar[]>;
}

/* ─────────────────────── Entities ─────────────────────── */

export interface CompanyEntity {
  ticker: string;
  cashtag: string;
  officialName: string;
  shortNames: string[];
  products: string[];
  subsidiaries: string[];
  misspellings: string[];
  exclusions: string[];
  ambiguousAliases: string[];
  ambiguousTicker: boolean;
  previousTickers: string[];
  wikipediaTitle: string | null;
  githubOrgs: string[];
  searchTerm: string;
  sector: string;
}
