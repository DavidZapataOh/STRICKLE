import { type Facts, type Lang, type NumberStyle, formatFact } from "@strickle/brain";

const MAX_LENGTH = 600;

const NUMBER_WORDS: Record<Lang, string[]> = {
  en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "hundreds", "thousand", "thousands", "million", "millions", "billion", "dozen", "dozens", "half", "first", "second", "third"],
  es: ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciseis", "diecisiete", "dieciocho", "diecinueve", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa", "cien", "ciento", "cientos", "doscientos", "doscientas", "trescientos", "trescientas", "cuatrocientos", "cuatrocientas", "quinientos", "quinientas", "seiscientos", "seiscientas", "setecientos", "setecientas", "ochocientos", "ochocientas", "novecientos", "novecientas", "mil", "miles", "millon", "millones", "docena", "mitad", "primero", "segundo", "tercero"],
  "pt-br": ["zero", "dois", "duas", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa", "cem", "cento", "centos", "duzentos", "duzentas", "trezentos", "trezentas", "quatrocentos", "quatrocentas", "quinhentos", "quinhentas", "seiscentos", "seiscentas", "setecentos", "setecentas", "oitocentos", "oitocentas", "novecentos", "novecentas", "mil", "milhao", "milhoes", "duzia", "metade", "primeiro", "segundo", "terceiro"],
};

const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The model writes plain Latin words and `{placeholder}` markers only. Any numeral of any script (after Unicode compatibility folding),
 * any character outside plain Latin text, a spelled-out number, an unknown or malformed placeholder, or a long text rejects it;
 * otherwise the markers are replaced by the engine's own formatted values.
 */
export function renderExplanation(modelText: string, facts: Facts, lang: Lang, style: NumberStyle): { ok: true; text: string } | { ok: false; reason: string } {
  const text = modelText.trim();
  if (text === "") return { ok: false, reason: "empty text" };
  if (text.length > MAX_LENGTH) return { ok: false, reason: "text too long" };

  const known = new Set(Object.keys(facts.values));
  const used = [...text.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1] as string);
  const withoutMarkers = text.replace(/\{[^{}]*\}/g, " ");
  if (/[{}]/.test(withoutMarkers)) return { ok: false, reason: "malformed placeholder" };
  const unknown = used.find((key) => !known.has(key));
  if (unknown !== undefined) return { ok: false, reason: `unknown placeholder ${unknown}` };

  const normalized = withoutMarkers.normalize("NFKC");
  if (/\p{N}/u.test(normalized)) return { ok: false, reason: "the text contains a numeral" };
  if (!/^[\p{Script=Latin}\p{M}\s.,;:!?\u00bf\u00a1()'"\-\u2013\u2014]*$/u.test(normalized)) return { ok: false, reason: "the text has characters outside plain Latin text" };

  const words = fold(normalized).split(/[^a-z]+/).filter(Boolean);
  const banned = new Set([...NUMBER_WORDS[lang], ...(lang === "en" ? [] : NUMBER_WORDS.en)]);
  const spelled = words.find((word) => banned.has(word) || /^veinti/.test(word));
  if (spelled !== undefined) return { ok: false, reason: `the text spells out a number: ${spelled}` };

  return { ok: true, text: text.replace(/\{([^{}]*)\}/g, (_match, key: string) => formatFact(facts.values[key] as Parameters<typeof formatFact>[0], lang, style)) };
}

/** The facts the engine wants shown that a model text never mentions: an explanation that drops a number is not accepted. */
export function missingFacts(modelText: string, facts: Facts): string[] {
  const used = new Set([...modelText.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1] as string));
  return Object.keys(facts.values).filter((key) => !used.has(key));
}
