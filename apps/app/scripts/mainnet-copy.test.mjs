import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const load = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/dictionaries/${locale}.json`, import.meta.url), "utf8"));
const locales = ["en", "es", "pt-br"];
const UNAVAILABLE = ["agentPause", "agentSettings", "enclaveProposals", "plan"];

test("every locale carries the disclosures, both agent modes, the unavailable page and one honest line per hidden capability", () => {
  for (const locale of locales) {
    const t = load(locale);
    for (const key of ["limits", "testnet", "pool", "tax", "freeze"]) assert.ok(String(t.disclosures?.[key] ?? "").trim(), `${locale}: disclosures.${key}`);
    for (const mode of ["none", "cre-testnet"]) {
      assert.ok(String(t.agent?.modes?.[mode]?.title ?? "").trim(), `${locale}: agent.modes.${mode}.title`);
      assert.ok(String(t.agent?.modes?.[mode]?.body ?? "").trim(), `${locale}: agent.modes.${mode}.body`);
    }
    for (const key of UNAVAILABLE) assert.ok(String(t.agent?.unavailable?.[key] ?? "").trim(), `${locale}: agent.unavailable.${key}`);
    for (const key of ["title", "body", "numbers"]) assert.ok(String(t.unavailable?.[key] ?? "").trim(), `${locale}: unavailable.${key}`);
  }
});

test("the copy for a network with no agent never claims a confidential enclave or automatic splitting", () => {
  const enclave = /(confidential|enclave|confidencial|private workflow|flujo privado|fluxo privado)/i;
  const automatic = /(automatic|automátic|sozinho|por sí mismo|por si mismo|by itself)/i;
  for (const locale of locales) {
    const t = load(locale);
    const texts = [t.agent.modes.none.title, t.agent.modes.none.body, ...UNAVAILABLE.map((key) => t.agent.unavailable[key]), t.unavailable.title, t.unavailable.body];
    for (const text of texts) {
      assert.doesNotMatch(text, enclave, `${locale}: over-claims: ${text}`);
      assert.doesNotMatch(text, automatic, `${locale}: over-claims: ${text}`);
    }
  }
});

test("the private pool is declared unaudited and off on mainnet, and nothing is promised safe or covered by insurance", () => {
  const unaudited = { en: /not been audited/i, es: /no ha sido auditado/i, "pt-br": /não foi auditado/i };
  const promise = { en: /(safe|guaranteed|insured)/i, es: /(seguro|segura|garantizad|asegurad)/i, "pt-br": /(seguro|segura|garantid|assegurad)/i };
  for (const locale of locales) {
    const t = load(locale);
    assert.match(t.disclosures.pool, unaudited[locale], `${locale}: the pool disclosure must say it is unaudited`);
    assert.match(t.disclosures.pool, /mainnet/i, `${locale}: the pool disclosure must say where it is off`);
    assert.doesNotMatch(Object.values(t.disclosures).join(" "), promise[locale], `${locale}: a disclosure promises safety`);
  }
});
