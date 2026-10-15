// Brand principle 5 (BRANDING.md §2): marketing word budget per locale.
// hero ≤ 25 · section headline ≤ 4 · section support ≤ 12 · page ≤ 200.
// Not counted: the legal footer, amounts/dates/numbers, example client names, and accessible-only names.
import { readFileSync } from "node:fs";

const LOCALES = ["en", "es", "pt-br"];
const words = (s) => s.replace(/US\$[\d.,]+|\{\w+\}|[\d.,%≥]+/g, " ").split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
const failures = [];
const check = (loc, label, text, max) => {
  const n = words(text);
  if (n > max) failures.push(`${loc} · ${label}: ${n} > ${max} — "${text}"`);
  return n;
};

for (const loc of LOCALES) {
  const t = JSON.parse(readFileSync(new URL(`../src/i18n/dictionaries/${loc}.json`, import.meta.url)));
  const h = t.hero;
  check(loc, "hero", [h.line1, h.line2, h.support1, h.support2].join(" "), 25);

  const headlines = [
    ...t.sequence.acts.map((a, i) => [`sequence act ${i + 1}`, a.title]),
    ["simulator", t.simulator.title],
    ["bento", t.bento.title],
    ["close", `${t.close.line1} ${t.close.line2}`],
  ];
  headlines.forEach(([label, text]) => check(loc, `${label} headline`, text, 4));

  const cards = ["cert", "pause", "receipt", "taxes", "private", "mirror", "guarantee"];
  const supports = [
    ...t.sequence.acts.map((a, i) => [`sequence act ${i + 1}`, a.body]),
    ["simulator", t.simulator.support],
    ...cards.map((c) => [`bento ${c}`, t.bento[c].body]),
  ];
  supports.forEach(([label, text]) => check(loc, `${label} support`, text, 12));

  // the page: every visible marketing string (headlines, supports, card titles, CTAs, nav)
  const page = [
    ...Object.entries(t.nav).filter(([k]) => k !== "language").map(([, v]) => v),
    h.line1, h.line2, h.support1, h.support2, h.cta, h.secondary,
    ...headlines.map(([, v]) => v),
    ...supports.map(([, v]) => v),
    ...cards.map((c) => t.bento[c].title),
    t.simulator.cta, t.close.cta, t.close.verify,
  ].join(" ");
  const total = check(loc, "page", page, 200);
  console.log(`${loc}: ${total}/200 words`);
}

// voice: neutral Latin American Spanish uses tú (no usted, no voseo); banned phrases everywhere (BRANDING.md §2.6)
const BANNED = /\b(crypto|cripto|risk-free|sin riesgo|sem risco|guaranteed yield|rendimiento garantizado|rendimento garantido|safe investment|inversi[oó]n segura|investimento seguro|no one can freeze|nadie puede congelar|ningu[eé]m pode congelar)\b/iu;
const NOT_TU = /\b(usted|ustedes|vos|ten[eé]s|pod[eé]s|quer[eé]s|sab[eé]s|cobr[aá]s irregular, viv[ií]s)\b/iu;
for (const loc of LOCALES) {
  const raw = readFileSync(new URL(`../src/i18n/dictionaries/${loc}.json`, import.meta.url), "utf8");
  const b = raw.match(BANNED);
  if (b) failures.push(`${loc} · banned phrase "${b[0]}"`);
  if (loc === "es") {
    const v = raw.match(NOT_TU);
    if (v) failures.push(`es · not neutral tú: "${v[0]}"`);
  }
}

if (failures.length) {
  console.error(`\nWord budget exceeded:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("Word budget OK");
