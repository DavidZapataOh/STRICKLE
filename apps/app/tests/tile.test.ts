import { describe, expect, it } from "vitest";
import { salaryTile } from "../src/home/tile.ts";
import { planNotice } from "./fixtures-plan.ts";

const withSalary = (patch: Partial<ReturnType<typeof planNotice>["salary"]>) => planNotice({ salary: { ...planNotice().salary, ...patch } });

describe("salaryTile", () => {
  it("is secured only when the plan is fresh, the whole salary is payable, nobody's signature is needed and the agent runs", () => {
    expect(salaryTile(planNotice(), "2026-11-01", false).state).toBe("secured");
    expect(salaryTile(planNotice(), "2026-11-03", false).state).toBe("secured");
  });

  it("is never secured when the plan is more than two days old", () => {
    const tile = salaryTile(planNotice(), "2026-11-04", false);
    expect(tile.state).toBe("stale");
    expect(tile.checked).toBe("2026-11-01");
  });

  it("is not secured when the plan is dated after our own clock by more than a day, or the day is malformed", () => {
    expect(salaryTile(planNotice(), "2026-10-29", false).state).toBe("stale");
    expect(salaryTile(planNotice(), "not a date", false).state).toBe("stale");
    expect(salaryTile(planNotice(), "2026-10-31", false).state).toBe("secured");
  });

  it("asks for approval, rather than promising, when the agent may not pay without a signature", () => {
    expect(salaryTile(withSalary({ needsApproval: true }), "2026-11-01", false)).toMatchObject({ state: "approval", reason: "approval" });
  });

  it("is partial with the amount payable and the reason when the safe maximum is below what is owed", () => {
    const tile = salaryTile(withSalary({ safeNow: "500000000", pending: "1300000000", binding: "cushion-floor" }), "2026-11-01", false);
    expect(tile).toMatchObject({ state: "partial", payNow: 500_000_000n, pending: 1_300_000_000n, reason: "cushion-floor" });
  });

  it("is on hold while the agent is paused or has stopped itself, whatever else is true", () => {
    expect(salaryTile(planNotice(), "2026-11-01", true)).toMatchObject({ state: "held", reason: "paused" });
    expect(salaryTile(withSalary({ halted: true }), "2026-11-01", false)).toMatchObject({ state: "held", reason: "halted" });
  });

  it("never claims more is payable than is owed and says none when nothing is owed", () => {
    expect(salaryTile(withSalary({ safeNow: "9999999999" }), "2026-11-01", false).payNow).toBe(1_800_000_000n);
    expect(salaryTile(withSalary({ owed: "0", safeNow: "0" }), "2026-11-01", false).state).toBe("none");
  });
});
