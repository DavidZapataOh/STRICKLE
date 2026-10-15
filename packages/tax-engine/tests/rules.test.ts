import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { assertCurrent, loadRules, parseRule } from "../src/index.ts";

const rule = (id: string, country = "MX") => ({
  id,
  country,
  regime: "RESICO",
  kind: "resico-monthly",
  version: "2026.1",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  source: { title: "SAT", url: "https://www.sat.gob.mx/", retrievedOn: "2026-10-01" },
  verification: "unverified",
  params: {
    currency: "MXN",
    brackets: [{ upTo: "25000.00", rateBps: 100 }],
    annualCap: "3500000.00",
    dueDay: 17,
    withholdingRateBps: 125,
    vatRateBps: 1600,
  },
});

function tree(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "rules-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

describe("loadRules", () => {
  it("loads every rule under a country folder, sorted by id", () => {
    const root = tree({ "MX/b.json": rule("b"), "MX/a.json": rule("a"), "BR/c.json": rule("c", "BR") });
    expect(loadRules(root).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("names the file of an invalid rule", () => {
    const root = tree({ "MX/bad.json": { ...rule("bad"), source: undefined } });
    expect(() => loadRules(root)).toThrow(/MX\/bad\.json.*source: required/);
  });

  it("names the file of malformed JSON", () => {
    const root = tree({ "MX/broken.json": "{ nope" });
    expect(() => loadRules(root)).toThrow(/MX\/broken\.json/);
  });

  it("rejects a duplicate id", () => {
    const root = tree({ "MX/a.json": rule("same"), "MX/b.json": rule("same") });
    expect(() => loadRules(root)).toThrow(/duplicate rule id "same"/);
  });

  it("rejects a rule filed under another country's folder", () => {
    const root = tree({ "BR/a.json": rule("a", "MX") });
    expect(() => loadRules(root)).toThrow(/BR\/a\.json.*country MX/);
  });

  it("ignores files that are not JSON", () => {
    const root = tree({ "MX/a.json": rule("a"), "MX/README.md": "notes" });
    expect(loadRules(root)).toHaveLength(1);
  });
});

describe("assertCurrent", () => {
  const loaded = [parseRule(rule("a"))];
  it("passes inside the window", () => {
    expect(() => assertCurrent(loaded, plainDate(2026, 12, 31))).not.toThrow();
  });
  it("names every rule that has expired or not started", () => {
    expect(() => assertCurrent(loaded, plainDate(2027, 1, 1))).toThrow(/a \(MX\).*2026-12-31/);
    expect(() => assertCurrent(loaded, plainDate(2025, 12, 31))).toThrow(/a \(MX\)/);
  });
});

describe("shipped rules", () => {
  it("all load and are within their validity today", () => {
    const rules = loadRules(new URL("../rules", import.meta.url).pathname);
    const now = new Date();
    assertCurrent(rules, plainDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()));
  });
});
