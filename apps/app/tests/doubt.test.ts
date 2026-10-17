import { describe, expect, it } from "vitest";
import { doubtsOf } from "../src/activity/doubt.ts";

const SENDER = "0x00000000000000000000000000000000000000a1";
const doubt = (arrivalId: string, over: Record<string, unknown> = {}) => ({ kind: "income-doubt" as const, arrivalId, asset: "USDC" as const, amount: "500000000", flags: ["own-address" as const], sender: SENDER, ...over });
const fixed = (arrivalId: string) => ({ kind: "reclassified" as const, arrivalId, amount: "500000000", from: "income" as const, to: "own-transfer" as const });

describe("doubtsOf", () => {
  it("lists the unanswered doubts, newest first", () => {
    const found = doubtsOf([doubt("aaaaaaaaaa-0"), doubt("bbbbbbbbbb-0")], new Set());
    expect(found.map((d) => d.arrivalId)).toEqual(["bbbbbbbbbb-0", "aaaaaaaaaa-0"]);
    expect(found[0]).toMatchObject({ amount: 500_000_000n, asset: "USDC", sender: SENDER });
  });
  it("drops a doubt a later correction settled, and one the user acknowledged", () => {
    expect(doubtsOf([doubt("aaaaaaaaaa-0"), fixed("aaaaaaaaaa-0")], new Set())).toEqual([]);
    expect(doubtsOf([doubt("aaaaaaaaaa-0")], new Set(["aaaaaaaaaa-0"]))).toEqual([]);
  });
  it("keeps a doubt when the correction came before it, and reads an empty sender as no sender", () => {
    expect(doubtsOf([fixed("aaaaaaaaaa-0"), doubt("aaaaaaaaaa-0", { sender: "", flags: ["unattributed"] })], new Set())[0]).toMatchObject({ sender: null, flags: ["unattributed"] });
  });
  it("ignores every other kind of notice", () => {
    expect(doubtsOf([{ kind: "salary", month: "2026-11", paid: "1", pending: "0" }], new Set())).toEqual([]);
  });
});
