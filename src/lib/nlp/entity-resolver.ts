import { FINANCE_CONTEXT_TERMS } from "@/data/entities";
import type { CompanyEntity } from "../providers/types";

/**
 * Company-mention resolution.
 *
 * Not a substring search. Text is tokenised; aliases are matched as whole
 * token sequences; ambiguous aliases (word-like tickers, "Apple", "Visa"…)
 * require contextual evidence; exclusion phrases veto a match; and every
 * match records the reason it was accepted so it can be audited in the UI.
 */

export type MatchReason =
  | "cashtag"
  | "ticker"
  | "ticker+context"
  | "name"
  | "name+context"
  | "product"
  | "product+context"
  | "subsidiary"
  | "misspelling"
  | "previous_ticker";

export interface MentionMatch {
  ticker: string;
  matchedText: string;
  reason: MatchReason;
  tokenIndex: number;
  charOffset: number;
  inTitle: boolean;
}

export interface ResolvedMention {
  ticker: string;
  reasons: MatchReason[];
  bestReason: MatchReason;
  matchedTexts: string[];
  count: number;
  relevance: number;
  /** True when the only evidence came from aliases that needed context. */
  ambiguous: boolean;
  /** Character offsets in `title + "\n" + body`, used to window sentiment. */
  offsets: number[];
}

export interface RejectedMatch {
  ticker: string;
  matchedText: string;
  why: "no_context" | "exclusion" | "shouting";
}

export interface ResolutionResult {
  mentions: ResolvedMention[];
  rejected: RejectedMatch[];
  /** The exact text that was analysed (title + newline + body). */
  text: string;
}

const REASON_BASE: Record<MatchReason, number> = {
  cashtag: 0.95,
  ticker: 0.9,
  name: 0.85,
  previous_ticker: 0.7,
  "ticker+context": 0.75,
  "name+context": 0.75,
  misspelling: 0.6,
  product: 0.6,
  "product+context": 0.6,
  subsidiary: 0.55,
};

/** Strong market-context words for bare ambiguous tickers ("T", "NOW", "CAT"…). */
const STRONG_CONTEXT = new Set([
  "stock", "stocks", "shares", "share", "ticker", "earnings", "calls", "puts", "options", "dividend",
  "nyse", "nasdaq", "eps", "guidance", "position", "positions", "bagholder", "bagholders", "portfolio",
  "10-k", "10-q", "buyback", "premarket", "after-hours", "short", "shorts", "long",
]);
const FINANCE_CONTEXT = new Set(FINANCE_CONTEXT_TERMS);

/** Single-word product names that are also ordinary words: need company context. */
const COMMON_WORD_PRODUCTS = new Set([
  "windows", "teams", "chrome", "threads", "quest", "foundry", "java", "slack", "tide", "prime", "axon",
  "mako", "gotham", "aip", "falcon", "instinct", "kindle", "alexa", "pixel", "android", "office",
]);

const GENERIC_NAME_TOKENS = new Set(["inc", "inc.", "corp", "corporation", "company", "the", "group", "holdings", "co", "plc", "and", "technologies", "international", "systems", "platforms", "energy", "financial", "networks", "bank", "american", "united", "general", "applied", "texas", "health", "pharmaceuticals", "laboratories", "sciences", "materials", "devices", "research", "services", "communications", "data", "markets", "capital", "southern", "union"]);

const TOKEN_RE = /\$?[A-Za-z0-9](?:[A-Za-z0-9&'’+.\-]*[A-Za-z0-9+])?/g;

export function tokenize(text: string): { tokens: string[]; offsets: number[] } {
  const tokens: string[] = [];
  const offsets: number[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    tokens.push(m[0].replace(/’/g, "'"));
    offsets.push(m.index ?? 0);
  }
  return { tokens, offsets };
}

type AliasKind = "name" | "product" | "subsidiary" | "misspelling" | "previous_ticker";
interface AliasEntry {
  ticker: string;
  tokens: string[];
  lower: string[];
  kind: AliasKind;
  caseSensitive: boolean;
  needsContext: boolean;
  text: string;
}

export class EntityResolver {
  private readonly byFirstToken = new Map<string, AliasEntry[]>();
  private readonly byTicker = new Map<string, CompanyEntity>();
  /** Lowercase tokens of each company's unambiguous aliases + products (context evidence). */
  private readonly contextTokens = new Map<string, Set<string>>();

  constructor(private readonly entities: CompanyEntity[]) {
    for (const e of entities) {
      this.byTicker.set(e.ticker, e);
      const ambiguous = new Set(e.ambiguousAliases.map((a) => a.toLowerCase()));
      const add = (text: string, kind: AliasKind) => {
        const { tokens } = tokenize(text);
        if (!tokens.length) return;
        const lower = tokens.map((t) => t.toLowerCase());
        const single = tokens.length === 1;
        const isAmbiguousName = ambiguous.has(text.toLowerCase());
        const isCommonProduct = kind === "product" && single && COMMON_WORD_PRODUCTS.has(lower[0] as string);
        const entry: AliasEntry = {
          ticker: e.ticker,
          tokens,
          lower,
          kind,
          // Single-word products and ambiguous names must be capitalised as written.
          caseSensitive: (kind === "product" && single) || isAmbiguousName || kind === "previous_ticker",
          needsContext: isAmbiguousName || isCommonProduct,
          text,
        };
        const key = lower[0] as string;
        const arr = this.byFirstToken.get(key) ?? [];
        arr.push(entry);
        this.byFirstToken.set(key, arr);
      };
      add(e.officialName, "name");
      e.shortNames.forEach((s) => add(s, "name"));
      e.products.forEach((s) => add(s, "product"));
      e.subsidiaries.forEach((s) => add(s, "subsidiary"));
      e.misspellings.forEach((s) => add(s, "misspelling"));
      e.previousTickers.forEach((s) => add(s, "previous_ticker"));

      const ctx = new Set<string>();
      for (const s of [...e.shortNames, ...e.products, ...e.subsidiaries, e.officialName]) {
        if (ambiguous.has(s.toLowerCase())) continue;
        for (const t of tokenize(s).tokens) {
          const lt = t.toLowerCase();
          if (lt.length > 2 && !ambiguous.has(lt) && !GENERIC_NAME_TOKENS.has(lt)) ctx.add(lt);
        }
      }
      this.contextTokens.set(e.ticker, ctx);
    }
    // Longest aliases first so "Bank of America" wins over shorter overlaps.
    for (const arr of this.byFirstToken.values()) arr.sort((a, b) => b.tokens.length - a.tokens.length);
  }

  entity(ticker: string): CompanyEntity | undefined {
    return this.byTicker.get(ticker);
  }

  resolve(title: string, body: string): ResolutionResult {
    const text = title ? `${title}\n${body}` : body;
    const { tokens, offsets } = tokenize(text);
    const lower = tokens.map((t) => t.toLowerCase());
    const titleTokenCount = title ? tokenize(title).tokens.length : 0;
    const textLower = text.toLowerCase();
    const letters = text.replace(/[^A-Za-z]/g, "");
    const upperRatio = letters.length ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
    const shouting = letters.length > 25 && upperRatio > 0.7;

    const raw: MentionMatch[] = [];
    const rejected: RejectedMatch[] = [];
    const consumed = new Set<number>();
    const pending: { m: MentionMatch; needs: "strong" | "finance" }[] = [];

    for (let i = 0; i < tokens.length; i++) {
      if (consumed.has(i)) continue;
      const tok = tokens[i] as string;
      const inTitle = i < titleTokenCount;

      // 1. Cashtags: strongest evidence, accepted for any ticker (case-insensitive).
      if (tok.startsWith("$") && tok.length > 1) {
        const t = tok.slice(1).toUpperCase();
        if (this.byTicker.has(t)) {
          raw.push({ ticker: t, matchedText: tok, reason: "cashtag", tokenIndex: i, charOffset: offsets[i] ?? 0, inTitle });
          consumed.add(i);
          continue;
        }
      }

      // 2. Multi-token and single-token aliases.
      const cands = this.byFirstToken.get(lower[i] as string);
      let matched = false;
      if (cands) {
        for (const a of cands) {
          const n = a.tokens.length;
          if (i + n > tokens.length) continue;
          let ok = true;
          for (let k = 0; k < n; k++) {
            const got = a.caseSensitive ? tokens[i + k] : lower[i + k];
            const want = a.caseSensitive ? a.tokens[k] : a.lower[k];
            if (got !== want) { ok = false; break; }
          }
          if (!ok) continue;
          const span = textLower.slice(Math.max(0, (offsets[i] ?? 0) - 40), (offsets[i + n - 1] ?? 0) + 60);
          const ent = this.byTicker.get(a.ticker) as CompanyEntity;
          if (ent.exclusions.some((ex) => span.includes(ex))) {
            rejected.push({ ticker: a.ticker, matchedText: a.text, why: "exclusion" });
            for (let k = 0; k < n; k++) consumed.add(i + k);
            matched = true;
            break;
          }
          const reason: MatchReason =
            a.kind === "name" ? (a.needsContext ? "name+context" : "name")
            : a.kind === "product" ? (a.needsContext ? "product+context" : "product")
            : a.kind;
          const m: MentionMatch = { ticker: a.ticker, matchedText: tokens.slice(i, i + n).join(" "), reason, tokenIndex: i, charOffset: offsets[i] ?? 0, inTitle };
          if (a.needsContext) pending.push({ m, needs: "finance" });
          else raw.push(m);
          for (let k = 0; k < n; k++) consumed.add(i + k);
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 3. Bare uppercase tickers.
      const tickerTok = tok.toUpperCase() === tok ? tok : null;
      if (tickerTok && this.byTicker.has(tickerTok)) {
        const ent = this.byTicker.get(tickerTok) as CompanyEntity;
        if (!ent.ambiguousTicker) {
          raw.push({ ticker: tickerTok, matchedText: tok, reason: "ticker", tokenIndex: i, charOffset: offsets[i] ?? 0, inTitle });
        } else if (shouting) {
          rejected.push({ ticker: tickerTok, matchedText: tok, why: "shouting" });
        } else {
          pending.push({ m: { ticker: tickerTok, matchedText: tok, reason: "ticker+context", tokenIndex: i, charOffset: offsets[i] ?? 0, inTitle }, needs: "strong" });
        }
      }
    }

    // Resolve context-dependent matches now that all unambiguous evidence is known.
    const confirmed = new Set(raw.map((r) => r.ticker));
    for (const { m, needs } of pending) {
      if (confirmed.has(m.ticker) || this.hasContext(m, lower, needs)) {
        raw.push(m);
      } else {
        rejected.push({ ticker: m.ticker, matchedText: m.matchedText, why: "no_context" });
      }
    }

    return { mentions: aggregate(raw), rejected, text };
  }

  private hasContext(m: MentionMatch, lower: string[], needs: "strong" | "finance"): boolean {
    const lo = Math.max(0, m.tokenIndex - 8);
    const hi = Math.min(lower.length, m.tokenIndex + 9);
    const own = this.contextTokens.get(m.ticker) ?? new Set<string>();
    for (let k = lo; k < hi; k++) {
      if (k === m.tokenIndex) continue;
      const t = lower[k] as string;
      if (STRONG_CONTEXT.has(t)) return true;
      if (needs === "finance" && FINANCE_CONTEXT.has(t)) return true;
    }
    // Any other alias/product of the same company anywhere in the document.
    for (let k = 0; k < lower.length; k++) {
      if (k === m.tokenIndex) continue;
      if (own.has(lower[k] as string)) return true;
    }
    return false;
  }
}

function aggregate(matches: MentionMatch[]): ResolvedMention[] {
  const by = new Map<string, MentionMatch[]>();
  for (const m of matches) by.set(m.ticker, [...(by.get(m.ticker) ?? []), m]);
  const nCompanies = by.size;
  const out: ResolvedMention[] = [];
  for (const [ticker, ms] of by) {
    const reasons = Array.from(new Set(ms.map((m) => m.reason)));
    const best = reasons.reduce((a, b) => (REASON_BASE[b] > REASON_BASE[a] ? b : a));
    let rel = REASON_BASE[best] + Math.min(0.1, 0.03 * (ms.length - 1)) + (ms.some((m) => m.inTitle) ? 0.05 : 0);
    if (nCompanies >= 5) rel *= 0.6;
    else if (nCompanies >= 3) rel *= 0.85;
    out.push({
      ticker,
      reasons,
      bestReason: best,
      matchedTexts: Array.from(new Set(ms.map((m) => m.matchedText))).slice(0, 5),
      count: ms.length,
      relevance: Math.min(1, Math.round(rel * 1000) / 1000),
      ambiguous: reasons.every((r) => r.endsWith("+context")),
      offsets: ms.map((m) => m.charOffset),
    });
  }
  return out.sort((a, b) => b.relevance - a.relevance);
}
