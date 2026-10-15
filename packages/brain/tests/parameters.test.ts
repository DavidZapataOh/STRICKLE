import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateParameterProposal } from "../src/parameters.ts";

const context = { floorDays: 14, targetDays: 42 };
const propose = (name: string, value: number, ctx = context) => validateParameterProposal(name, value, ctx);

describe("validateParameterProposal", () => {
  it("accepts a value inside its range and logs it", () => {
    expect(propose("epsilonBps", 300)).toEqual({ name: "epsilonBps", requested: 300, applied: 300, status: "accepted", reason: "within the allowed range 50 to 500" });
  });
  it("accepts the edges of the range", () => {
    expect(propose("epsilonBps", 50).status).toBe("accepted");
    expect(propose("epsilonBps", 500).status).toBe("accepted");
  });
  it("clamps a value outside its range and says what was requested and applied", () => {
    expect(propose("epsilonBps", 5_000)).toEqual({ name: "epsilonBps", requested: 5_000, applied: 500, status: "clamped", reason: "above the allowed range 50 to 500" });
    expect(propose("marginBps", 10)).toEqual({ name: "marginBps", requested: 10, applied: 100, status: "clamped", reason: "below the allowed range 100 to 1000" });
  });
  it("keeps the target at or above the floor and the floor at or below the target", () => {
    expect(propose("targetDays", 10, { floorDays: 21, targetDays: 42 })).toMatchObject({ applied: 21, status: "clamped" });
    expect(propose("floorDays", 25, { floorDays: 14, targetDays: 20 })).toMatchObject({ applied: 20, status: "clamped" });
  });
  it("accepts only 3, 6 or 12 months for the emergency fund", () => {
    for (const months of [3, 6, 12]) expect(propose("emergencyMonths", months)).toMatchObject({ applied: months, status: "accepted" });
    expect(propose("emergencyMonths", 4)).toMatchObject({ applied: null, status: "rejected" });
  });
  it("rejects unknown names, non-integers, negatives and NaN", () => {
    expect(propose("dailyCap", 5)).toMatchObject({ applied: null, status: "rejected", reason: expect.stringContaining("unknown") });
    expect(propose("epsilonBps", 150.5)).toMatchObject({ applied: null, status: "rejected" });
    expect(propose("epsilonBps", -5)).toMatchObject({ status: "clamped", applied: 50 });
    expect(propose("epsilonBps", Number.NaN)).toMatchObject({ applied: null, status: "rejected" });
  });
  it("never applies a value outside the range, whatever is proposed (property)", () => {
    const ranges: Record<string, [number, number]> = { epsilonBps: [50, 500], floorDays: [7, 30], targetDays: [14, 90], marginBps: [100, 1_000], raiseStepBps: [100, 2_500] };
    fc.assert(fc.property(fc.constantFrom(...Object.keys(ranges)), fc.integer({ min: -1_000_000, max: 1_000_000 }), (name, value) => {
      const change = propose(name, value);
      const [min, max] = ranges[name] as [number, number];
      expect(change.applied).not.toBeNull();
      expect(change.applied as number).toBeGreaterThanOrEqual(min);
      expect(change.applied as number).toBeLessThanOrEqual(max);
    }), { numRuns: 200 });
  });
});
