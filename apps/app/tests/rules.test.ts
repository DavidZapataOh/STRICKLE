import { describe, expect, it } from "vitest";
import { describeRule } from "../src/chain/rules.ts";

const base = { delaySeconds: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0 };
const now = 1_800_000_000;

describe("describeRule", () => {
  it("says free when nothing restricts the box", () => {
    expect(describeRule(base, now)).toEqual([{ key: "free" }]);
  });

  it("describes a hard lock only while it lasts", () => {
    expect(describeRule({ ...base, lockedUntil: now + 100 }, now)).toEqual([{ key: "locked", until: now + 100 }]);
    expect(describeRule({ ...base, lockedUntil: now - 1 }, now)).toEqual([{ key: "free" }]);
  });

  it("combines the wait, the floor and the approved-recipient rule in a fixed order", () => {
    expect(describeRule({ delaySeconds: 172_800, alwaysDelayed: true, restricted: true, floor: 0n, lockedUntil: 0 }, now)).toEqual([{ key: "always", hours: 48 }, { key: "restricted" }]);
    expect(describeRule({ ...base, delaySeconds: 86_400, floor: 5_000_000n }, now)).toEqual([{ key: "below", floor: 5_000_000n, hours: 24 }]);
  });
});
