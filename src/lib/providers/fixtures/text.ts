import type { CompanyEntity } from "../types";
import type { Rng } from "../../util/rng";

/**
 * Template phrasebook for SYNTHETIC demo posts. Phrasing is intentionally
 * varied (cashtags, names, products, misspellings, sarcasm, questions) so the
 * entity resolver and classifier are exercised on realistic edge cases.
 */
type Aspect = "investment" | "product" | "reputation";
type Pol = "pos" | "neg" | "neu";

const T: Record<Aspect, Record<Pol, string[]>> = {
  investment: {
    pos: [
      "{co} looks strong into earnings, adding to my position",
      "Bought more {tag} shares on the dip, long term bullish",
      "{tag} breakout incoming, calls are printing 🚀",
      "Honestly {co} is undervalued here, revenue growth is accelerating",
      "Holding {tag} through earnings, I expect raised guidance",
      "{co} stock keeps grinding higher, very solid quarter",
      "Rotating into {tag}, the buyback plus growth story is great",
    ],
    neg: [
      "Sold my {tag} shares, valuation is silly and growth is slowing",
      "{co} looks weak, I think this stock is overvalued and due for a selloff",
      "Bagholders of {tag} where are you? This thing keeps tanking 📉",
      "Bearish on {co} after that guidance, puts loaded",
      "{tag} missed expectations again, not worth holding",
      "Trimming {co} stock, margins are under pressure and the quarter was disappointing",
      "{tag} is dead money, worst position in my portfolio",
    ],
    neu: [
      "What's everyone's take on {tag} stock at these levels?",
      "Thinking about {co} shares for my portfolio, any thoughts?",
      "{tag} earnings date is next week, position sizing question",
      "How are you all positioned on {co} into the quarter?",
      "Is {tag} a hold or are there better options in the sector?",
    ],
  },
  product: {
    pos: [
      "The new {prod} from {co} is amazing, speed and battery are great",
      "Been using {prod} for a month, honestly impressive and reliable",
      "{co} support fixed my issue fast, great service",
      "Switched our team to {prod} and it works great, highly recommend",
      "{prod} release notes look excellent, the improved features are a game changer",
    ],
    neg: [
      "{prod} update is buggy and slow, really disappointed with {co}",
      "Another {co} outage today, {prod} is unusable for our team",
      "{co} quality has gotten worse, my {prod} broke after two weeks",
      "Cancelled my {co} subscription, the price hike is not worth it",
      "{prod} keeps crashing after the latest update, terrible experience",
    ],
    neu: [
      "Anyone tried the latest {prod} release from {co}?",
      "Comparing {prod} with alternatives for our team, notes inside",
      "{co} announced a new {prod} version today, details in the link",
      "Question about {prod} setup, the docs from {co} are unclear",
    ],
  },
  reputation: {
    pos: [
      "{co} CEO praised for leadership on the new partnership",
      "{co} wins award for workplace culture, employees seem happy",
      "Good to see {co} settle things with regulators and move on",
    ],
    neg: [
      "{co} faces lawsuit and a regulators probe, leadership under fire",
      "Layoffs at {co} again, culture concerns from employees",
      "{co} fined by regulators over a privacy breach",
      "Investigation into {co} executives widens, this is a mess",
    ],
    neu: [
      "{co} board announces new executive appointments",
      "{co} responds to questions from congress about its practices",
      "Union talks at {co} continue this week",
    ],
  },
};

const SARCASTIC = [
  "Yeah right, {co} quality is totally fine /s",
  "Great job guys, another {co} update that breaks everything 🙃",
  "{tag} to the moon they said, what could go wrong",
];

const HN_PREFIX = ["", "", "Ask HN: ", "", "Tell HN: "];

/** Free-text openers/closers so synthetic posts are not trivially duplicated. */
const OPENERS = ["", "", "", "Quick one:", "Long time lurker here.", "Unpopular opinion:", "Update:", "PSA:", "Honest question,", "So", "Ok so", "Real talk:", "Not financial advice but", "Context:", "FWIW"];
const CLOSERS = ["", "", "", "Curious what others think.", "Am I missing something?", "Thoughts?", "Will report back.", "Ymmv.", "Discuss.", "Change my mind.", "Edit: typo", "Could be off base.", "Source: my own notes.", "Just my 2c."];
const DETAILS = [
  "been following this for {n} months", "saw it come up {n} times in my feed today", "talked to {n} coworkers about it",
  "my {n} year old nephew asked about it", "read the whole thread twice", "spent {n} hours on this over the weekend",
  "my team of {n} has been discussing it", "first post in {n} years", "on my {n}th coffee", "after a {n} hour flight",
];

export const NOISE = [
  "Made an apple pie with my grandma this weekend, best apple recipe ever",
  "NOW is the time to learn Rust, the borrow checker finally clicked",
  "My CAT knocked over the plant again, any tips?",
  "Need help with my student visa interview next month",
  "The Amazon rainforest documentary last night was incredible",
  "Is this meta analysis of sleep studies any good?",
  "Nikola Tesla biography recommendations please",
  "GE ME A COFFEE, I CANNOT DEAL WITH MONDAY",
  "Visa sponsorship question for H1B transfers",
  "Low key the best tacos in town are at the corner place",
  "The meta game in this season is all about tanks",
];

export const NON_ENGLISH = [
  "Las acciones de {co} suben hoy, la empresa tiene buenos resultados",
  "Die Aktie von {co} ist heute gefallen, nicht gut für die Anleger",
  "Les actions de {co} sont en hausse avec une forte demande",
];

/** Pick a surface form for the company appropriate to the aspect. */
function alias(e: CompanyEntity, rng: Rng, aspect: Aspect): { co: string; tag: string; prod: string } {
  const name = rng.pick(e.shortNames.length ? e.shortNames : [e.officialName]);
  const misspelt = e.misspellings.length && rng.chance(0.05) ? rng.pick(e.misspellings) : null;
  const co = misspelt ?? (rng.chance(0.08) ? e.officialName : name);
  // Cashtags for word-like tickers; bare tickers otherwise.
  const tag =
    aspect === "investment" && rng.chance(0.55)
      ? e.cashtag
      : e.ambiguousTicker
        ? (rng.chance(0.5) ? e.cashtag : name)
        : (rng.chance(0.6) ? e.ticker : name);
  const prod = e.products.length && rng.chance(0.8) ? rng.pick(e.products) : `${name}'s app`;
  return { co, tag, prod };
}

export function fill(tpl: string, a: { co: string; tag: string; prod: string }): string {
  return tpl.replaceAll("{co}", a.co).replaceAll("{tag}", a.tag).replaceAll("{prod}", a.prod);
}

export function composePost(
  e: CompanyEntity,
  rng: Rng,
  aspect: Aspect,
  tone: number,
  source: "reddit" | "hackernews",
): { title: string; body: string; aspect: Aspect } {
  const pNeu = 0.3;
  const pPos = (1 - pNeu) / (1 + Math.exp(-4 * tone));
  const u = rng.uniform();
  const pol: Pol = u < pPos ? "pos" : u < pPos + pNeu ? "neu" : "neg";
  const a = alias(e, rng, aspect);
  if (pol !== "neu" && rng.chance(0.03)) {
    return { title: "", body: fill(rng.pick(SARCASTIC), a), aspect };
  }
  const main = fill(rng.pick(T[aspect][pol]), a);
  const prefix = source === "hackernews" ? rng.pick(HN_PREFIX) : rng.pick(OPENERS);
  // After a sentence-style opener ("Not financial advice but"), continue in lower case.
  const lowerNext = prefix !== "" && !/[.:]\s*$/.test(prefix);
  const startsWithName = [a.co, a.tag, a.prod].some((x) => main.startsWith(x));
  const body0 = lowerNext && !startsWithName ? `${main[0]?.toLowerCase()}${main.slice(1)}` : main;
  const title = `${prefix}${prefix && !prefix.endsWith(": ") ? " " : ""}${body0}`.trim();
  const detail = rng.pick(DETAILS).replace("{n}", String(rng.int(2, 40)));
  const closer = rng.pick(CLOSERS);
  // Most posts are title-only or title + short body.
  if (rng.chance(0.35)) return { title, body: `${detail[0]?.toUpperCase()}${detail.slice(1)}. ${closer}`.trim(), aspect };
  const extra = fill(rng.pick(T[aspect][rng.chance(0.7) ? pol : "neu"]), a);
  return { title, body: `${extra}, ${detail}. ${closer}`.trim(), aspect };
}

export function pickAspect(rng: Rng, source: "reddit" | "hackernews"): Aspect {
  const u = rng.uniform();
  if (source === "reddit") return u < 0.55 ? "investment" : u < 0.83 ? "product" : "reputation";
  return u < 0.15 ? "investment" : u < 0.7 ? "product" : "reputation";
}

const SECTOR_SUBS: Record<string, string[]> = {
  "Information Technology": ["technology", "hardware", "sysadmin", "programming", "cybersecurity"],
  "Communication Services": ["technology", "movies", "cordcutters", "gadgets"],
  "Consumer Discretionary": ["electricvehicles", "BuyItForLife", "frugal", "travel"],
  "Consumer Staples": ["Costco", "frugal", "Cooking"],
  Financials: ["personalfinance", "banking", "FinancialCareers"],
  "Health Care": ["biotech", "medicine", "pharmacy"],
  Industrials: ["aviation", "engineering", "trains"],
  Energy: ["energy", "oil"],
  Utilities: ["energy", "solar"],
  "Real Estate": ["realestateinvesting", "REBubble"],
};
const INVEST_SUBS = ["wallstreetbets", "stocks", "investing", "StockMarket", "options", "dividends", "ValueInvesting"];

export function pickCommunity(rng: Rng, e: CompanyEntity, aspect: Aspect): string {
  if (aspect === "investment") return rng.pick(INVEST_SUBS);
  return rng.pick(SECTOR_SUBS[e.sector] ?? ["news"]);
}
