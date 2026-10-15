import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRules } from "../src/index.ts";

const base = {
  id: "x",
  country: "MX",
  regime: "r",
  version: "1",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  source: { title: "s", url: "https://example.org/", retrievedOn: "2026-10-01" },
  verification: "unverified",
};

function load(rule: unknown) {
  const root = mkdtempSync(join(tmpdir(), "kinds-"));
  mkdirSync(join(root, "MX"));
  writeFileSync(join(root, "MX", "x.json"), JSON.stringify(rule));
  return () => loadRules(root);
}

describe("kinds in loadRules", () => {
  it("rejects an unknown kind", () => {
    expect(load({ ...base, kind: "mystery", params: {} })).toThrow(/MX\/x\.json.*unknown kind "mystery"/);
  });

  it("rejects params that do not parse for their kind", () => {
    expect(load({ ...base, kind: "resico-monthly", params: { currency: "MXN" } })).toThrow(/MX\/x\.json/);
  });
});
