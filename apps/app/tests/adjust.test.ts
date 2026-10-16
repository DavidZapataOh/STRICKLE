import { describe, expect, it } from "vitest";
import { cushionChange, cushionRanges, limitsChange, parseWholeDollars, presetChange, salaryChange, settingsMatch } from "../src/settings/adjust.ts";

const payee = "0x00000000000000000000000000000000000000b2";

describe("parseWholeDollars", () => {
  it("takes whole dollars only", () => {
    expect(parseWholeDollars("1800")).toBe(1800);
    expect(parseWholeDollars(" 25 ")).toBe(25);
    for (const bad of ["", "12.5", "-3", "1e3", "1,800", "abc", "1234567890"]) expect(parseWholeDollars(bad)).toBeNull();
  });
});

describe("salaryChange", () => {
  it("builds an adjust with the base-unit amount, the day and the payee", () => {
    expect(salaryChange({ proposedDollars: "1800", day: "5", payee })).toEqual({ ok: true, action: { kind: "adjust", changes: { salaryProposed: "1800000000", salaryDay: 5, payee } } });
  });

  it.each([
    ["a zero salary", { proposedDollars: "0" }, "amount"],
    ["a day of 29", { day: "29" }, "day"],
    ["a day of 0", { day: "0" }, "day"],
    ["a payee that is not an address", { payee: "0x123" }, "payee"],
    ["the zero address", { payee: "0x0000000000000000000000000000000000000000" }, "payee"],
    ["nothing to change", {}, "amount"],
  ])("refuses %s", (_name, input, error) => {
    expect(salaryChange(input)).toEqual({ ok: false, error });
  });
});

describe("limitsChange and presetChange", () => {
  it("sets the threshold and the daily cap in base units", () => {
    expect(limitsChange({ thresholdDollars: "2000", dailyCapDollars: "500" })).toEqual({ ok: true, action: { kind: "adjust", changes: { signatureThreshold: "2000000000", dailyCap: "500000000" } } });
    expect(limitsChange({ thresholdDollars: "0" })).toEqual({ ok: true, action: { kind: "adjust", changes: { signatureThreshold: "0" } } });
    expect(limitsChange({ thresholdDollars: "x" })).toEqual({ ok: false, error: "amount" });
  });

  it("maps the two autonomy choices to the one threshold the agent enforces", () => {
    expect(presetChange("ask", "")).toEqual({ ok: true, action: { kind: "adjust", changes: { signatureThreshold: "0" } } });
    expect(presetChange("auto", "1800")).toEqual({ ok: true, action: { kind: "adjust", changes: { signatureThreshold: "1800000000" } } });
    expect(presetChange("auto", "0")).toEqual({ ok: false, error: "amount" });
  });
});

describe("settingsMatch", () => {
  const settings = { proposed: "1000000", day: 1, payee: "0x00000000000000000000000000000000000000B2", dailyCap: "100000000", signatureThreshold: "0", floorDays: 14, targetDays: 42, halted: false, haltCodes: [] as string[] };

  it("is true only when every requested change is the value now in force", () => {
    expect(settingsMatch({ signatureThreshold: "0" }, settings)).toBe(true);
    expect(settingsMatch({ signatureThreshold: "1800000000" }, settings)).toBe(false);
    expect(settingsMatch({ salaryDay: 5, floorDays: 14 }, settings)).toBe(false);
    expect(settingsMatch({ salaryDay: 1, floorDays: 14, targetDays: 42 }, settings)).toBe(true);
  });

  it("compares the payee without regard to letter case", () => {
    expect(settingsMatch({ payee: "0x00000000000000000000000000000000000000b2" }, settings)).toBe(true);
  });
});

describe("cushionChange", () => {
  const current = { floorDays: 14, targetDays: 42 };

  it("accepts values inside the brain's ranges and nothing else", () => {
    expect(cushionChange({ floorDays: "21", current })).toEqual({ ok: true, action: { kind: "adjust", changes: { floorDays: 21 } } });
    expect(cushionChange({ targetDays: "60", current })).toEqual({ ok: true, action: { kind: "adjust", changes: { targetDays: 60 } } });
    expect(cushionChange({ floorDays: "3", current })).toEqual({ ok: false, error: "floor" });
    expect(cushionChange({ floorDays: "50", current })).toEqual({ ok: false, error: "floor" });
    expect(cushionChange({ targetDays: "10", current })).toEqual({ ok: false, error: "target" });
    expect(cushionChange({ targetDays: "200", current })).toEqual({ ok: false, error: "target" });
  });

  it("keeps the floor at or below the target", () => {
    expect(cushionChange({ floorDays: "30", targetDays: "20", current })).toEqual({ ok: false, error: "order" });
    expect(cushionRanges(current)).toEqual({ floor: [7, 30], target: [14, 90] });
  });
});
