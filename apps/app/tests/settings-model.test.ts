import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import type { PlanNotice } from "@strickle/agent/notice-schema";
import { settingsModel } from "../src/settings/model.ts";
import { planNotice } from "./fixtures-plan.ts";
import type { SettingsChain } from "../src/settings/chain.ts";

const payee = "0x00000000000000000000000000000000000000b2" as const;
const agent = "0x00000000000000000000000000000000000000dd" as const;
const chain = (patch: Partial<SettingsChain["limits"]> = {}, approvals: SettingsChain["approvals"] = {}): SettingsChain => ({
  limits: { agent, paused: false, cap: 100_000_000n, windowSeconds: 86_400, ...patch },
  pending: [null, null, null, null, null, null],
  approvals,
});
const plan = (settings: Partial<PlanNotice["settings"]> = {}, asOf = "2026-11-01"): PlanNotice => {
  const original = planNotice();
  return { ...original, asOf, settings: { ...original.settings, proposed: "1000000", day: 1, payee, dailyCap: "100000000", signatureThreshold: "0", ...settings } };
};
const base = { todayIso: "2026-11-01", now: 1_793_000_000 };

describe("settingsModel", () => {
  it("is running with the agent's limits and the plan's settings", () => {
    const model = settingsModel({ chain: chain(), plan: plan(), ...base });
    expect(model.agent).toEqual({ state: "running", haltCodes: [] });
    expect(model.limits).toEqual({ capUnits: 100_000_000n, windowHours: 24 });
    expect(model.plan).toBe("fresh");
    expect(model.autonomy).toBe("ask");
    expect(model.salary).toMatchObject({ proposed: 1_000_000n, day: 1, payee, payeeApproval: "none" });
    expect(model.cushion).toEqual({ floorDays: 14, targetDays: 42 });
    expect(model.asOf).toBe("2026-11-01");
  });

  it("reads the on-chain pause first, whatever the plan says", () => {
    expect(settingsModel({ chain: chain({ paused: true }), plan: plan(), ...base }).agent.state).toBe("paused");
  });

  it("is not set up when no agent is delegated", () => {
    expect(settingsModel({ chain: chain({ agent: zeroAddress }), plan: plan(), ...base }).agent.state).toBe("none");
  });

  it("tells a pause inside the agent from a stop by a safety rule, and names the codes", () => {
    expect(settingsModel({ chain: chain(), plan: plan({ halted: true, haltCodes: ["user-pause"] }), ...base }).agent.state).toBe("halted-user");
    const stopped = settingsModel({ chain: chain(), plan: plan({ halted: true, haltCodes: ["books-balance", "cushion-floor"] }), ...base });
    expect(stopped.agent).toEqual({ state: "halted-safety", haltCodes: ["books-balance", "cushion-floor"] });
  });

  it("calls a threshold above zero automatic and zero asking first", () => {
    expect(settingsModel({ chain: chain(), plan: plan({ signatureThreshold: "2000000" }), ...base })).toMatchObject({ autonomy: "auto", threshold: 2_000_000n });
    expect(settingsModel({ chain: chain(), plan: plan({ signatureThreshold: "0" }), ...base })).toMatchObject({ autonomy: "ask", threshold: 0n });
  });

  it("marks a plan older than two days stale and shows no settings it cannot know without one", () => {
    expect(settingsModel({ chain: chain(), plan: plan({}, "2026-10-28"), ...base }).plan).toBe("stale");
    const none = settingsModel({ chain: chain(), plan: null, ...base });
    expect(none).toMatchObject({ plan: "missing", autonomy: "unknown", threshold: null, salary: null, cushion: null, asOf: null });
  });

  it("reports the payee's approval from the vault", () => {
    const key = `3:${payee.toLowerCase()}`;
    expect(settingsModel({ chain: chain({}, { [key]: { effectiveAt: base.now + 3600 } }), plan: plan(), ...base }).salary?.payeeApproval).toBe("waiting");
    expect(settingsModel({ chain: chain({}, { [key]: { effectiveAt: base.now - 1 } }), plan: plan(), ...base }).salary?.payeeApproval).toBe("effective");
  });
});
