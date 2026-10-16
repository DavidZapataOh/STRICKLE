import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const load = (name) => JSON.parse(readFileSync(new URL(`../src/i18n/dictionaries/${name}.json`, import.meta.url), "utf8"));
const en = load("en");

// Proper nouns that read the same in every language; anything else identical to English is an untranslated string.
const IDENTICAL = new Set(["meta.title", "shell.brand"]);

const paths = (value, prefix = "") =>
  Object.entries(value).flatMap(([key, inner]) => (typeof inner === "object" && inner !== null ? paths(inner, `${prefix}${key}.`) : [`${prefix}${key}`]));
const at = (value, path) => path.split(".").reduce((node, key) => node?.[key], value);

for (const locale of ["es", "pt-br"]) {
  test(`${locale} has exactly the keys of English, none empty`, () => {
    const other = load(locale);
    assert.deepEqual(paths(other).sort(), paths(en).sort());
    for (const path of paths(other)) assert.ok(String(at(other, path)).trim().length > 0, `${locale}:${path} is empty`);
  });

  test(`${locale} is actually translated`, () => {
    const other = load(locale);
    const same = paths(en).filter((path) => at(en, path) === at(other, path) && !IDENTICAL.has(path));
    assert.deepEqual(same, [], `untranslated in ${locale}: ${same.join(", ")}`);
  });
}

test("no dictionary promises what is not there", () => {
  const banned = /(no one can freeze|safe investment|guaranteed yield|risk-free|crypto)/i;
  for (const locale of ["en", "es", "pt-br"]) {
    for (const path of paths(load(locale))) assert.doesNotMatch(String(at(load(locale), path)), banned, `${locale}:${path}`);
  }
});
