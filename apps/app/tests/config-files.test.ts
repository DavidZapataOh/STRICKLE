import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPolicy, loadTeam } from "../src/server/config-files.ts";
import { policyDigest } from "../src/server/wave.ts";

const file = (text: string) => {
  const path = join(mkdtempSync(join(tmpdir(), "config-")), "file.json");
  writeFileSync(path, text);
  return new URL(`file://${path}`);
};

describe("the committed early-access policy", () => {
  it("carries the owner's numbers, so a change to them shows up as a failing test and a new digest", () => {
    const { policy, text } = loadPolicy();
    expect(policy.totalUnits).toBe(10_000_000_000n);
    expect(policy.teamMaxSharePercent).toBe(20);
    expect(policy.tranches.map((tranche) => [tranche.maxUsers, tranche.perUserUnits, tranche.holdDays])).toEqual([
      [5, 250_000_000n, 14],
      [15, 500_000_000n, 14],
      [30, 500_000_000n, null],
    ]);
    expect(policyDigest(text)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a policy that does not parse", () => {
    expect(() => loadPolicy(file('{ "totalUsd": "5" }'))).toThrow();
  });
});

describe("the team file", () => {
  it("is committed and parses", () => {
    expect(Array.isArray(loadTeam())).toBe(true);
  });

  it("lower-cases and drops duplicates", () => {
    const a = "0x00000000000000000000000000000000000000AA";
    expect(loadTeam(file(JSON.stringify({ addresses: [a, a.toLowerCase()] })))).toEqual([a.toLowerCase()]);
  });

  it.each([
    ["not an object", "[]"],
    ["no addresses field", "{}"],
    ["an entry that is not an address", JSON.stringify({ addresses: ["0x123"] })],
    ["a number", JSON.stringify({ addresses: [5] })],
  ])("refuses %s", (_name, text) => {
    expect(() => loadTeam(file(text))).toThrow();
  });
});
