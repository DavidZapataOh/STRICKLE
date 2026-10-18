import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { inviteDue, inviteStep } from "../enclave/yield-invite.ts";
import { profileOf } from "./support.ts";

const today = plainDate(2026, 11, 30);
const history = (first: string) => [[first, "100000000", "deposit"] as [string, string, string], ["2026-11-20", "50000000", "deposit"] as [string, string, string]];
const bank = (over: Record<string, unknown> = {}) => profileOf({ history: history("2026-11-02"), ...over });

describe("inviteStep", () => {
  it("invites an account with yield off after four weeks of history, once, quoting the observed rate", () => {
    const first = inviteStep({ profile: bank(), today, apyBps: 420 });
    expect(first.notices).toEqual([{ kind: "yield-invite", apyBps: 420 }]);
    expect(first.next.yield.invitedOn).toBe("2026-11-30");
    expect(inviteStep({ profile: first.next, today, apyBps: 420 }).notices).toEqual([]);
  });

  it("waits for the history, for a rate, and never invites an account that has yield on", () => {
    expect(inviteStep({ profile: bank({ history: history("2026-11-03") }), today, apyBps: 420 }).notices).toEqual([]);
    expect(inviteStep({ profile: bank(), today, apyBps: null }).notices).toEqual([]);
    expect(inviteStep({ profile: bank({ yield: { enabled: true, day: "", realized: "0", fee: "0", invitedOn: "" } }), today, apyBps: 420 }).notices).toEqual([]);
  });

  it("does not invite an account that has no history at all", () => {
    expect(inviteStep({ profile: profileOf(), today, apyBps: 420 }).notices).toEqual([]);
  });

  it("never invites an account that switched yield on and then off", () => {
    const off = bank({ yield: { enabled: false, day: "2026-11-10", realized: "0", fee: "0", invitedOn: "2026-11-10" } });
    expect(inviteStep({ profile: off, today, apyBps: 420 }).notices).toEqual([]);
  });

  it("says whether an invitation could be raised at all, so the vaults are only looked at when it matters", () => {
    expect(inviteDue(bank(), today)).toBe(true);
    expect(inviteDue(profileOf(), today)).toBe(false);
    expect(inviteDue(bank({ yield: { enabled: true, day: "", realized: "0", fee: "0", invitedOn: "" } }), today)).toBe(false);
    expect(inviteDue(bank({ yield: { enabled: false, day: "", realized: "0", fee: "0", invitedOn: "2026-11-10" } }), today)).toBe(false);
  });
});
