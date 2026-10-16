import { describe, expect, it } from "vitest";
import { approvalFrom, approvalKey, approvalState, pendingFrom, ruleFromRaw } from "../src/settings/chain.ts";

const raw = { delay: 86_400, alwaysDelayed: true, restricted: false, floor: 5_000_000n, lockedUntil: 1_900_000_000n };

describe("ruleFromRaw", () => {
  it("maps the contract's rule to the screen's rule", () => {
    expect(ruleFromRaw(raw)).toEqual({ delaySeconds: 86_400, alwaysDelayed: true, restricted: false, floor: 5_000_000n, lockedUntil: 1_900_000_000 });
  });
});

describe("pendingFrom", () => {
  it("is null when no change is open", () => {
    expect(pendingFrom(4, [raw, 0n, false])).toBeNull();
  });

  it("carries the box, the proposed rule and the date it can be applied", () => {
    expect(pendingFrom(4, [raw, 1_800_086_400n, true])).toEqual({ box: 4, rule: ruleFromRaw(raw), effectiveAt: 1_800_086_400 });
  });
});

describe("approvals", () => {
  it("treats a zero timestamp as no approval", () => {
    expect(approvalFrom(0n)).toBeNull();
    expect(approvalFrom(1_800_000_000n)).toEqual({ effectiveAt: 1_800_000_000 });
  });

  it("is waiting before its date, effective on it and after", () => {
    const approval = { effectiveAt: 1_000 };
    expect(approvalState(null, 5_000)).toBe("none");
    expect(approvalState(approval, 999)).toBe("waiting");
    expect(approvalState(approval, 1_000)).toBe("effective");
    expect(approvalState(approval, 2_000)).toBe("effective");
  });

  it("keys approvals by box and lower-cased address", () => {
    expect(approvalKey(3, "0x00000000000000000000000000000000000000AA")).toBe("3:0x00000000000000000000000000000000000000aa");
  });
});
