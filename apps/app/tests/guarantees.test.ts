import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUARANTEES } from "../src/config/guarantees.ts";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("the guarantees the proof page states", () => {
  it("each names a function that exists in its contract and a test that exists in its test file", () => {
    for (const entry of GUARANTEES) {
      expect(read(entry.source), `${entry.id}: ${entry.source}`).toMatch(new RegExp(`function ${entry.function}\\(`));
      expect(read(entry.test), `${entry.id}: ${entry.test}`).toMatch(new RegExp(`function ${entry.testName}\\(`));
    }
  });

  it("have unique ids and all three languages, in plain words", () => {
    expect(new Set(GUARANTEES.map((entry) => entry.id)).size).toBe(GUARANTEES.length);
    for (const entry of GUARANTEES) for (const lang of ["en", "es", "pt-br"] as const) expect(entry.text[lang].length).toBeGreaterThan(20);
  });

  it("never promise safety, audits, insurance or a guarantee in the sense of a promise", () => {
    const banned = /\b(safe|safety|audited|insured|insurance|risk-free|guaranteed|seguro|auditad[oa]|asegurad[oa]|garantizad[oa]|garantido|garantida|segur[oa])\b/i;
    for (const entry of GUARANTEES) for (const lang of ["en", "es", "pt-br"] as const) expect(entry.text[lang], `${entry.id} ${lang}`).not.toMatch(banned);
  });

  it("cover the owner's way out, the limits on payments, the pause and the bounds on conversions and yield", () => {
    const ids = GUARANTEES.map((entry) => entry.id);
    for (const wanted of ["owner-takes-money-out", "pays-approved-only", "rolling-cap", "box-floor", "pause-at-once", "swap-oracle-bound", "adapter-waits-a-day", "yield-share-price-bound", "ledger-by-balances", "invest-limits"]) expect(ids).toContain(wanted);
  });
});
