import { ASPECT_WEIGHTS } from "@/config/signal";
import type { RawDocument } from "../providers/types";
import { cleanText } from "../nlp/clean";
import { detectLanguage } from "../nlp/lang";
import { Deduplicator, type DedupeStatus } from "../nlp/dedupe";
import type { EntityResolver, ResolvedMention } from "../nlp/entity-resolver";
import type { SentimentResult, TextClassifier } from "../nlp/sentiment";
import type { DailyMetricRow } from "../signals/features";

/** Minimum relevance for a mention to count toward metrics. */
export const MIN_RELEVANCE = 0.5;

export interface ProcessedDocument {
  doc: RawDocument;
  title: string;
  body: string;
  date: string;
  lang: string;
  dedupe: { status: DedupeStatus; duplicateOf: string | null };
  mentions: (ResolvedMention & { sentiment: SentimentResult | null })[];
}

/** Clean → language → de-duplicate → resolve entities → classify (per mention). */
export function processDocuments(docs: RawDocument[], resolver: EntityResolver, classifier: TextClassifier, dedupe: Deduplicator = new Deduplicator()): ProcessedDocument[] {
  const ordered = [...docs].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  return ordered.map((doc) => {
    const title = cleanText(doc.title);
    const body = cleanText(doc.body);
    const lang = detectLanguage(`${title} ${body}`);
    const d = dedupe.check({ key: `${doc.sourceId}:${doc.externalId}`, url: doc.url, community: doc.community, authorHash: doc.authorHash, text: `${title} ${body}` });
    const res = lang.lang === "other" ? null : resolver.resolve(title, body);
    const mentions = (res?.mentions ?? []).map((m) => ({
      ...m,
      sentiment: d.status === "unique" && res ? classifier.classify(res.text, m.offsets) : null,
    }));
    return { doc, title, body, date: doc.publishedAt.slice(0, 10), lang: lang.lang, dedupe: d, mentions };
  });
}

/** Same as processDocuments, but yields to the event loop between chunks (keeps servers responsive). */
export async function processDocumentsChunked(docs: RawDocument[], resolver: EntityResolver, classifier: TextClassifier, chunk = 2000): Promise<ProcessedDocument[]> {
  const dedupe = new Deduplicator();
  const ordered = [...docs].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const out: ProcessedDocument[] = [];
  for (let i = 0; i < ordered.length; i += chunk) {
    out.push(...processDocuments(ordered.slice(i, i + chunk), resolver, classifier, dedupe));
    await new Promise((r) => setImmediate(r));
  }
  return out;
}

/** Weight of one mention in engagement-adjusted counts. */
export function engagementWeight(relevance: number, score: number, comments: number): number {
  return relevance * (1 + Math.log1p(Math.max(0, score)) / 2 + Math.log1p(Math.max(0, comments)) / 4);
}

interface Acc {
  docs: number;
  dup: number;
  bot: number;
  ambiguous: number;
  authors: Set<string>;
  engagement: number;
  sw: number;
  sNum: number;
  pos: number;
  neg: number;
  conf: number;
  aspect: Record<"investment" | "product" | "reputation", { num: number; den: number }>;
  communities: Map<string, number>;
}

const newAcc = (): Acc => ({
  docs: 0, dup: 0, bot: 0, ambiguous: 0, authors: new Set(), engagement: 0, sw: 0, sNum: 0, pos: 0, neg: 0, conf: 0,
  aspect: { investment: { num: 0, den: 0 }, product: { num: 0, den: 0 }, reputation: { num: 0, den: 0 } },
  communities: new Map(),
});

/**
 * Aggregate processed documents into one row per (ticker, collected day).
 * Every ticker gets a row for every day the source was collected — an explicit
 * zero when nothing was said — while uncollected days get no row (missing).
 */
export function aggregateTextMetrics(
  processed: ProcessedDocument[],
  tickers: string[],
  collectedDays: string[],
): Map<string, DailyMetricRow[]> {
  const acc = new Map<string, Acc>();
  const key = (t: string, d: string) => `${t}|${d}`;
  for (const p of processed) {
    if (p.lang === "other") continue;
    for (const m of p.mentions) {
      if (m.relevance < MIN_RELEVANCE) continue;
      const k = key(m.ticker, p.date);
      const a = acc.get(k) ?? newAcc();
      acc.set(k, a);
      if (p.dedupe.status === "bot_repeat") { a.bot++; continue; }
      if (p.dedupe.status !== "unique") { a.dup++; continue; }
      a.docs++;
      if (m.ambiguous) a.ambiguous++;
      if (p.doc.authorHash) a.authors.add(p.doc.authorHash);
      const w = engagementWeight(m.relevance, p.doc.engagement.score, p.doc.engagement.comments);
      a.engagement += w;
      if (p.doc.community) a.communities.set(p.doc.community, (a.communities.get(p.doc.community) ?? 0) + 1);
      const s = m.sentiment;
      if (s) {
        const aw = ASPECT_WEIGHTS[s.aspect];
        const sw = w * s.confidence;
        const polar = s.label === "uncertain" ? 0 : s.score;
        a.sw += sw * aw;
        a.sNum += sw * aw * polar;
        a.conf += sw * aw * s.confidence;
        if (s.label === "positive") a.pos += sw * aw;
        if (s.label === "negative" || (s.label === "sarcastic" && s.score < 0)) a.neg += sw * aw;
        if (s.aspect !== "general") {
          a.aspect[s.aspect].num += sw * polar;
          a.aspect[s.aspect].den += sw;
        }
      }
    }
  }

  const out = new Map<string, DailyMetricRow[]>();
  for (const t of tickers) {
    const rows: DailyMetricRow[] = [];
    for (const d of collectedDays) {
      const a = acc.get(key(t, d));
      if (!a) {
        rows.push({ date: d, value: 0, mentionCount: 0, uniqueAuthors: 0, engagementAdj: 0, sentimentWeight: 0, dupRatio: 0, botRatio: 0, ambiguityRatio: 0, communityCount: 0 });
        continue;
      }
      const total = a.docs + a.dup + a.bot;
      const commTotal = Array.from(a.communities.values()).reduce((x, y) => x + y, 0);
      const hhi = commTotal ? Array.from(a.communities.values()).reduce((x, c) => x + (c / commTotal) ** 2, 0) : null;
      const asp = (k: "investment" | "product" | "reputation") => (a.aspect[k].den > 0 ? a.aspect[k].num / a.aspect[k].den : null);
      rows.push({
        date: d,
        value: a.docs,
        mentionCount: a.docs,
        uniqueAuthors: a.authors.size,
        engagementAdj: round(a.engagement),
        sentimentWeight: round(a.sw),
        netSentiment: a.sw > 0 ? round(a.sNum / a.sw) : null,
        posShare: a.sw > 0 ? round(a.pos / a.sw) : null,
        negShare: a.sw > 0 ? round(a.neg / a.sw) : null,
        sentimentConfidence: a.sw > 0 ? round(a.conf / a.sw) : null,
        investmentSentiment: asp("investment"),
        productSentiment: asp("product"),
        reputationSentiment: asp("reputation"),
        dupRatio: total ? round(a.dup / total) : 0,
        botRatio: total ? round(a.bot / total) : 0,
        ambiguityRatio: a.docs ? round(a.ambiguous / a.docs) : 0,
        communityCount: a.communities.size,
        communityHhi: hhi === null ? null : round(hhi),
      });
    }
    out.set(t, rows);
  }
  return out;
}

const round = (x: number) => Math.round(x * 10_000) / 10_000;
