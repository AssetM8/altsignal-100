/**
 * Deliberately inserted demo events. These are SYNTHETIC scenarios used to
 * exercise the pipeline and UI; they are not real historical observations.
 * Offsets are days before DEMO_AS_OF. Documented in docs/DATA_SOURCES.md.
 */
export interface DemoEvent {
  id: string;
  ticker: string;
  /** Days before the as-of date when the event starts. */
  startOffset: number;
  durationDays: number;
  title: string;
  /** Multiplicative attention shock per source (1 = none). */
  attention: Partial<Record<"reddit" | "hackernews" | "wikipedia" | "search" | "github", number>>;
  /** Additive shift to latent tone in [-1,1] by aspect. */
  tone?: Partial<Record<"investment" | "product" | "reputation", number>>;
  /** Per-source override of the tone shift (source disagreement scenario). */
  sourceToneOverride?: Partial<Record<"reddit" | "hackernews", number>>;
  /** Share of extra reddit items that are bot-like repeats. */
  botShare?: number;
  /** Synthetic price impact (daily log-return drift while active) — outcome label only. */
  priceDrift?: number;
  purpose: string;
}

export const DEMO_EVENTS: DemoEvent[] = [
  {
    id: "nvda-launch",
    ticker: "NVDA",
    startOffset: 20,
    durationDays: 6,
    title: "Product-launch attention surge confirmed across sources",
    attention: { reddit: 2.6, hackernews: 3.2, wikipedia: 2.4, search: 2.0, github: 1.4 },
    tone: { investment: 0.35, product: 0.45 },
    priceDrift: 0.004,
    purpose: "Broad, cross-source confirmed positive attention shock (high agreement, high confidence).",
  },
  {
    id: "ba-safety",
    ticker: "BA",
    startOffset: 35,
    durationDays: 8,
    title: "Safety-incident narrative: negative across all text sources",
    attention: { reddit: 3.0, hackernews: 2.5, wikipedia: 3.5, search: 2.8 },
    tone: { investment: -0.5, product: -0.6, reputation: -0.6 },
    priceDrift: -0.006,
    purpose: "Strong negative sentiment shock with abnormal attention everywhere.",
  },
  {
    id: "pltr-hype",
    ticker: "PLTR",
    startOffset: 10,
    durationDays: 5,
    title: "Reddit-only hype burst with bot-like repetition",
    attention: { reddit: 4.5 },
    tone: { investment: 0.6 },
    botShare: 0.5,
    purpose: "Unconfirmed single-source hype: should trigger hype-risk, bot and single-source penalties.",
  },
  {
    id: "crwd-outage",
    ticker: "CRWD",
    startOffset: 50,
    durationDays: 4,
    title: "Product outage: product sentiment collapses, investment talk stays calm",
    attention: { reddit: 2.2, hackernews: 4.0, wikipedia: 2.2, search: 2.4 },
    tone: { product: -0.75, investment: 0.05 },
    priceDrift: -0.003,
    purpose: "Product-versus-investment sentiment divergence signal.",
  },
  {
    id: "intc-dev",
    ticker: "INTC",
    startOffset: 25,
    durationDays: 14,
    title: "Developer-ecosystem activity acceleration",
    attention: { github: 2.8, hackernews: 1.5 },
    tone: { product: 0.3 },
    purpose: "Developer-activity acceleration that precedes social attention.",
  },
  {
    id: "unh-wiki",
    ticker: "UNH",
    startOffset: 60,
    durationDays: 3,
    title: "Wikipedia attention shock without social follow-through",
    attention: { wikipedia: 5.0, search: 1.6 },
    tone: { reputation: -0.3 },
    purpose: "Isolated encyclopaedic-attention shock (executive news style).",
  },
  {
    id: "dis-disagree",
    ticker: "DIS",
    startOffset: 15,
    durationDays: 7,
    title: "Cross-platform disagreement: Reddit upbeat, Hacker News negative",
    attention: { reddit: 2.0, hackernews: 2.5 },
    sourceToneOverride: { reddit: 0.55, hackernews: -0.6 },
    purpose: "Largest source-disagreement scenario.",
  },
  {
    id: "hood-crowding",
    ticker: "HOOD",
    startOffset: 4,
    durationDays: 4,
    title: "Retail-attention crowding into the as-of date",
    attention: { reddit: 3.4, search: 1.2 },
    tone: { investment: 0.45 },
    botShare: 0.2,
    purpose: "Recent anomaly near the as-of date; elevated crowding indicator.",
  },
];
