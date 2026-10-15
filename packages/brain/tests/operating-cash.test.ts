import { describe, expect, it } from "vitest";
import { emergencyTarget, operatingStatus } from "../src/operating-cash.ts";

const spend = 10n; // floor 140, target 420

describe("operatingStatus", () => {
  it("is below the floor under 14 days of spend", () => {
    expect(operatingStatus(139n, spend)).toMatchObject({ floor: 140n, target: 420n, floorGap: 1n, targetGap: 281n, coverageDays: 13, level: "below-floor" });
  });
  it("is building exactly at the floor and until the target", () => {
    expect(operatingStatus(140n, spend)).toMatchObject({ floorGap: 0n, targetGap: 280n, coverageDays: 14, level: "building" });
    expect(operatingStatus(419n, spend)).toMatchObject({ floorGap: 0n, targetGap: 1n, coverageDays: 41, level: "building" });
  });
  it("is at target exactly at 42 days and above it", () => {
    expect(operatingStatus(420n, spend)).toMatchObject({ targetGap: 0n, coverageDays: 42, level: "at-target" });
    expect(operatingStatus(10_000n, spend)).toMatchObject({ floorGap: 0n, targetGap: 0n, coverageDays: 1_000, level: "at-target" });
  });
  it("never divides by zero: zero spend means floor and target 0, coverage unknown and at-target", () => {
    expect(operatingStatus(0n, 0n)).toMatchObject({ floor: 0n, target: 0n, coverageDays: null, level: "at-target" });
    expect(operatingStatus(500n, 0n).coverageDays).toBeNull();
  });
  it("honours a custom policy", () => {
    expect(operatingStatus(150n, spend, { floorDays: 10, targetDays: 20 })).toMatchObject({ floor: 100n, target: 200n, level: "building" });
  });
  it("accepts a floor equal to the target", () => {
    expect(() => operatingStatus(1n, spend, { floorDays: 5, targetDays: 5 })).not.toThrow();
  });
  it("rejects a floor above the target, non-positive or fractional days and negative amounts", () => {
    expect(() => operatingStatus(1n, spend, { floorDays: 30, targetDays: 20 })).toThrow(RangeError);
    expect(() => operatingStatus(1n, spend, { floorDays: 0 })).toThrow(RangeError);
    expect(() => operatingStatus(1n, spend, { targetDays: 1.5 })).toThrow(RangeError);
    expect(() => operatingStatus(-1n, spend)).toThrow(RangeError);
    expect(() => operatingStatus(1n, -1n)).toThrow(RangeError);
  });
});

describe("emergencyTarget", () => {
  it("is 30 days x months x spend, 3 months by default", () => {
    expect(emergencyTarget(spend)).toBe(900n);
    expect(emergencyTarget(spend, 6)).toBe(1_800n);
    expect(emergencyTarget(spend, 12)).toBe(3_600n);
    expect(emergencyTarget(0n)).toBe(0n);
  });
  it("rejects other month counts and a negative spend", () => {
    expect(() => emergencyTarget(spend, 4 as 3)).toThrow(RangeError);
    expect(() => emergencyTarget(-1n)).toThrow(RangeError);
  });
});
