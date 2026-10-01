/**
 * Finance-aware lexicon sentiment classifier ("altsignal-lexicon", v1.0.0).
 *
 * Deliberately transparent: every score can be traced to matched terms.
 * It separates *aspect* (investment / product / reputation / general) from
 * polarity, so "love my new iPhone" is positive PRODUCT sentiment and is not
 * treated as a bullish investment opinion. Handles negation, intensifiers,
 * uncertainty and common sarcasm markers. Replaceable via the TextClassifier
 * interface (e.g. with FinBERT behind a Python service).
 */

export type SentimentLabel = "positive" | "negative" | "neutral" | "uncertain" | "sarcastic";
export type Aspect = "investment" | "product" | "reputation" | "general";
export type Direction = "bullish" | "bearish" | "neutral" | null;

export interface SentimentResult {
  label: SentimentLabel;
  /** Polarity in [-1, 1] after sarcasm handling. */
  score: number;
  confidence: number;
  aspect: Aspect;
  /** Only populated for investment-aspect items. */
  direction: Direction;
  matchedTerms: string[];
  flags: { negated: boolean; sarcasm: boolean; uncertain: boolean };
}

export interface ClassifierInfo {
  name: string;
  version: string;
  description: string;
}

export interface TextClassifier {
  readonly info: ClassifierInfo;
  /** `focusOffsets` = character offsets of the company mention; long texts are windowed around them. */
  classify(text: string, focusOffsets?: number[]): SentimentResult;
}

const LEXICON: Record<string, number> = {
  // investment / market
  bullish: 2.5, bearish: -2.5, moon: 2, mooning: 2.2, rally: 1.5, rallying: 1.5, undervalued: 1.5, overvalued: -1.5,
  beat: 1.5, beats: 1.5, crushed: 1.5, crush: 1.2, outperform: 1.5, upgrade: 1.2, downgrade: -1.2, breakout: 1.5,
  squeeze: 1, calls: 0.8, puts: -0.8, dump: -1.8, dumping: -1.8, tank: -2, tanking: -2.2, tanked: -2, crash: -2.5,
  crashing: -2.5, plunge: -2.2, plunging: -2.2, selloff: -1.8, bagholder: -1.5, bagholders: -1.5, bubble: -1.5,
  overhyped: -1.8, hype: -0.5, dilution: -1.5, miss: -1.5, missed: -1.5, misses: -1.5, record: 1, strong: 1.2,
  weak: -1.3, weakness: -1.3, growth: 1, growing: 1, accelerating: 1.2, decelerating: -1.2, slowing: -1, beat_expectations: 2,
  profit: 1, profitable: 1.2, losses: -1.3, loss: -1.1, buyback: 1, guidance_cut: -2, lowered: -1, raised: 1, raise: 0.8,
  rallied: 1.5, soared: 2, soaring: 2, surged: 1.8, surging: 1.8, jumped: 1.4, gains: 1, gained: 1, rose: 0.8,
  slumped: -1.8, dropped: -1.2, fell: -1.2, sinking: -1.6, sank: -1.6, plunged: -2.2, downbeat: -1.2, upbeat: 1.2,
  // product
  love: 2, loving: 2, amazing: 2.2, awesome: 2, great: 1.6, excellent: 2, impressive: 1.8, fast: 0.8, reliable: 1.4,
  smooth: 1, best: 1.6, better: 1, improved: 1.2, solid: 1.2, innovative: 1.5, delightful: 1.8, recommend: 1.4,
  hate: -2.2, terrible: -2.3, awful: -2.3, broken: -1.8, buggy: -1.8, bug: -1, bugs: -1.2, outage: -2, outages: -2, down: -0.7,
  slow: -1, laggy: -1.4, worse: -1.4, worst: -2.2, disappointing: -1.8, disappointed: -1.8, overpriced: -1.4, expensive: -0.8,
  recall: -2, defect: -1.8, defects: -1.8, failure: -1.8, failed: -1.6, unusable: -2.2, refund: -1, cancel: -1.2, cancelled: -1.3,
  // reputation
  lawsuit: -1.6, sued: -1.6, scandal: -2.3, fraud: -2.8, probe: -1.4, investigation: -1.4, fined: -1.6, fine: 0.5, antitrust: -1.2,
  layoffs: -1.4, layoff: -1.4, strike: -1, resign: -1, resigned: -1.1, ousted: -1.5, ethical: 0.8, trust: 1, trusted: 1.1,
  breach: -2, hacked: -2, leak: -1.2, praised: 1.6, award: 1.2, partnership: 1, partnered: 1, wins: 1.3, win: 1.1, won: 1.2,
  // generic
  good: 1.2, nice: 1, happy: 1.2, bad: -1.4, sad: -1, ugly: -1.4, worried: -1.2, concern: -0.9, concerns: -1, risk: -0.6,
  risky: -1, safe: 0.6, wow: 0.8, disaster: -2.5, mess: -1.6, horrible: -2.3, fantastic: 2.2, incredible: 2,
  "🚀": 2, "📈": 1.5, "📉": -1.5, "🔥": 1, "💎": 1, "🐂": 1.5, "🐻": -1.5, "💀": -1, "🤮": -2, "😍": 1.8, "😡": -1.8,
};

const PHRASES: Array<[string[], number]> = [
  [["to", "the", "moon"], 2.5],
  [["buy", "the", "dip"], 1.5],
  [["all", "time", "high"], 1.5],
  [["beat", "expectations"], 2],
  [["missed", "expectations"], -2],
  [["going", "to", "zero"], -2.8],
  [["rug", "pull"], -2.5],
  [["class", "action"], -1.8],
  [["guidance", "cut"], -2],
  [["raised", "guidance"], 2],
  [["dead", "money"], -1.8],
  [["short", "squeeze"], 1.2],
  [["price", "hike"], -1.2],
  [["not", "worth"], -1.5],
  [["works", "great"], 2],
  [["game", "changer"], 2],
];

const NEGATORS = new Set(["not", "no", "never", "isn't", "wasn't", "aren't", "don't", "doesn't", "didn't", "won't", "can't", "cannot", "hardly", "without", "nothing", "neither", "nor"]);
const INTENSIFIERS: Record<string, number> = { very: 1.4, extremely: 1.7, super: 1.4, really: 1.25, so: 1.15, massively: 1.6, totally: 1.3, absolutely: 1.5, insanely: 1.6, slightly: 0.6, somewhat: 0.7, kinda: 0.7, bit: 0.7 };
const UNCERTAINTY = new Set(["maybe", "might", "perhaps", "unsure", "idk", "uncertain", "possibly", "wondering", "unclear", "could", "guess", "hmm", "thoughts"]);
const SARCASM_MARKERS: string[][] = [["/s"], ["yeah", "right"], ["sure", "buddy"], ["what", "could", "go", "wrong"], ["totally", "not"], ["🙃"], ["🤡"], ["great", "job", "guys"], ["thanks", "a", "lot"], ["love", "that", "for", "us"]];

const ASPECT_CUES: Record<Exclude<Aspect, "general">, Set<string>> = {
  investment: new Set(["stock", "stocks", "shares", "share", "calls", "puts", "options", "buy", "buying", "sell", "selling", "sold", "position", "portfolio", "earnings", "valuation", "bullish", "bearish", "long", "short", "dip", "rally", "moon", "bag", "bagholder", "bagholders", "price", "eps", "dividend", "investors", "investing", "invest", "holding", "ticker", "market", "pe", "upside", "downside", "squeeze", "guidance", "quarter", "q3", "q4", "q1", "q2", "revenue"]),
  product: new Set(["phone", "battery", "update", "app", "outage", "service", "feature", "features", "launch", "launched", "quality", "bug", "bugs", "crash", "crashed", "customer", "subscription", "recall", "chip", "gpu", "gpus", "car", "drive", "driving", "food", "store", "laptop", "device", "software", "release", "version", "support", "delivery", "flight", "plane", "drug", "trial", "cloud", "api", "model", "camera", "screen", "sensor", "network", "coverage", "signal", "drink", "menu", "order", "fees"]),
  reputation: new Set(["ceo", "lawsuit", "layoffs", "layoff", "scandal", "fined", "regulators", "regulator", "antitrust", "ethics", "ethical", "union", "strike", "investigation", "probe", "leadership", "board", "executive", "executives", "culture", "employees", "workers", "sued", "doj", "ftc", "sec", "congress", "senate", "breach", "privacy"]),
};

const SENTIMENT_TOKEN_RE = /\/s\b|\p{Extended_Pictographic}|\?|[\p{L}\p{N}$][\p{L}\p{N}'’\-]*/gu;

export function sentimentTokens(text: string): { tokens: string[]; offsets: number[] } {
  const tokens: string[] = [];
  const offsets: number[] = [];
  for (const m of text.matchAll(SENTIMENT_TOKEN_RE)) {
    tokens.push(m[0].toLowerCase().replace(/’/g, "'"));
    offsets.push(m.index ?? 0);
  }
  return { tokens, offsets };
}

function matchAt(tokens: string[], i: number, phrase: string[]): boolean {
  for (let k = 0; k < phrase.length; k++) if (tokens[i + k] !== phrase[k]) return false;
  return true;
}

export class LexiconClassifier implements TextClassifier {
  readonly info: ClassifierInfo = {
    name: "altsignal-lexicon",
    version: "1.0.0",
    description: "Finance-aware lexicon with negation, intensifiers, sarcasm and aspect detection",
  };

  classify(text: string, focusOffsets?: number[]): SentimentResult {
    const { tokens: all, offsets } = sentimentTokens(text);
    // Window ±25 tokens around the mention(s) when the document discusses several things.
    let lo = 0;
    let hi = all.length;
    if (focusOffsets && focusOffsets.length && all.length > 60) {
      const idx = focusOffsets.map((o) => {
        let k = offsets.findIndex((x) => x >= o);
        if (k < 0) k = all.length - 1;
        return k;
      });
      lo = Math.max(0, Math.min(...idx) - 25);
      hi = Math.min(all.length, Math.max(...idx) + 26);
    }
    const t = all.slice(lo, hi);

    let raw = 0;
    let hits = 0;
    let negated = false;
    const matched: string[] = [];
    const used = new Set<number>();

    const weightFor = (i: number): number => {
      let w = 1;
      const prev = t[i - 1];
      if (prev && INTENSIFIERS[prev]) w *= INTENSIFIERS[prev] as number;
      for (let k = Math.max(0, i - 3); k < i; k++) {
        if (NEGATORS.has(t[k] as string) || (t[k] as string).endsWith("n't")) {
          w *= -0.8;
          negated = true;
          break;
        }
      }
      return w;
    };

    for (let i = 0; i < t.length; i++) {
      for (const [ph, val] of PHRASES) {
        if (matchAt(t, i, ph)) {
          raw += val * weightFor(i);
          hits++;
          matched.push(ph.join(" "));
          for (let k = 0; k < ph.length; k++) used.add(i + k);
        }
      }
    }
    for (let i = 0; i < t.length; i++) {
      if (used.has(i)) continue;
      const v = LEXICON[t[i] as string];
      if (v === undefined) continue;
      raw += v * weightFor(i);
      hits++;
      matched.push(t[i] as string);
    }

    const sarcasm = SARCASM_MARKERS.some((m) => t.some((_, i) => matchAt(t, i, m)));
    const uncertaintyHits = t.filter((x) => UNCERTAINTY.has(x)).length + (t.includes("?") ? 1 : 0);
    const uncertain = uncertaintyHits >= 2 || (uncertaintyHits >= 1 && Math.abs(raw) < 1.5);

    let score = Math.tanh(raw / 3);
    if (sarcasm) score = -0.5 * score - (score === 0 ? 0.1 : 0);

    // Aspect by cue counts inside the window.
    const counts: Record<Exclude<Aspect, "general">, number> = { investment: 0, product: 0, reputation: 0 };
    for (const x of t) for (const a of ["investment", "product", "reputation"] as const) if (ASPECT_CUES[a].has(x)) counts[a]++;
    const top = (Object.entries(counts) as [Exclude<Aspect, "general">, number][]).sort((a, b) => b[1] - a[1])[0];
    const aspect: Aspect = top && top[1] > 0 ? top[0] : "general";

    let label: SentimentLabel;
    if (sarcasm) label = "sarcastic";
    else if (uncertain && Math.abs(score) < 0.3) label = "uncertain";
    else if (score > 0.15) label = "positive";
    else if (score < -0.15) label = "negative";
    else label = "neutral";

    const evidence = 1 - Math.exp(-hits / 2);
    let confidence = 0.35 + 0.45 * evidence + 0.2 * Math.abs(score);
    if (sarcasm) confidence *= 0.5;
    if (uncertain) confidence *= 0.75;
    if (hits === 0) confidence = 0.5; // a confident "neutral" only in the sense of no polar terms

    const direction: Direction =
      aspect !== "investment" ? null : label === "positive" ? "bullish" : label === "negative" ? "bearish" : "neutral";

    return {
      label,
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round(Math.min(1, confidence) * 1000) / 1000,
      aspect,
      direction,
      matchedTerms: matched.slice(0, 12),
      flags: { negated, sarcasm, uncertain },
    };
  }
}

export const defaultClassifier: TextClassifier = new LexiconClassifier();
