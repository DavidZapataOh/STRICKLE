import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BoxRule } from "../src/chain/vault.ts";
import { MIN_LOOSEN_DELAY_SECONDS, classifyRuleChange, isTighter, loosenWaitSeconds, sameRule } from "../src/settings/rules.ts";

type Json = { delay: number; alwaysDelayed: boolean; restricted: boolean; floor: string; lockedUntil: number };
const rule = (json: Json): BoxRule => ({ delaySeconds: json.delay, alwaysDelayed: json.alwaysDelayed, restricted: json.restricted, floor: BigInt(json.floor), lockedUntil: json.lockedUntil });
const { cases } = JSON.parse(readFileSync(new URL("./fixtures/rule-changes.json", import.meta.url), "utf8")) as { cases: { name: string; current: Json; next: Json; expected: "immediate" | "delayed"; waitSeconds?: number }[] };

describe("the rule classification matches the shared fixture the contract is tested against", () => {
  it.each(cases)("$name is $expected", ({ current, next, expected, waitSeconds }) => {
    expect(classifyRuleChange(rule(current), rule(next))).toBe(expected);
    if (expected === "delayed") expect(loosenWaitSeconds(rule(current))).toBe(waitSeconds);
  });
});

describe("helpers", () => {
  it("never waits less than a day to loosen", () => {
    expect(MIN_LOOSEN_DELAY_SECONDS).toBe(86_400);
    expect(loosenWaitSeconds({ delaySeconds: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0 })).toBe(86_400);
    expect(loosenWaitSeconds({ delaySeconds: 259_200, alwaysDelayed: true, restricted: false, floor: 0n, lockedUntil: 0 })).toBe(259_200);
  });

  it("recognises an unchanged rule so the screen sends nothing", () => {
    const a = rule(cases[0]!.current);
    expect(sameRule(a, { ...a })).toBe(true);
    expect(sameRule(a, { ...a, floor: 1n })).toBe(false);
    expect(isTighter(a, { ...a })).toBe(true);
  });
});
