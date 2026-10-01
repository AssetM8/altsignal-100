/**
 * Lightweight language identification: stop-word coverage plus script check.
 * Good enough to drop clearly non-English items; it is not a general LID model.
 */
const EN_STOPWORDS = new Set(
  "the a an and or but is are was were be been to of in on for with at by from this that it its as i you he she we they my your our their not no do does did have has had will would can could should just so if than then there what which who about into over up out more very all any some".split(" "),
);
const OTHER_STOPWORDS = new Set(
  "el la los las de que y en un una es por para con pero der die das und ist nicht ein eine le les des et est pas une avec il della che di non per sono".split(" "),
);

export interface LangResult {
  lang: "en" | "other" | "unknown";
  confidence: number;
}

export function detectLanguage(text: string): LangResult {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters > 20 && latin / letters < 0.6) return { lang: "other", confidence: 0.9 };
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (tokens.length < 4) return { lang: "unknown", confidence: 0.3 };
  let en = 0;
  let other = 0;
  for (const t of tokens) {
    if (EN_STOPWORDS.has(t)) en++;
    if (OTHER_STOPWORDS.has(t)) other++;
  }
  if (other > en && other >= 2) return { lang: "other", confidence: Math.min(0.95, 0.5 + other / tokens.length) };
  if (en === 0 && tokens.length >= 8) return { lang: "unknown", confidence: 0.4 };
  return { lang: "en", confidence: Math.min(0.99, 0.6 + en / tokens.length) };
}
