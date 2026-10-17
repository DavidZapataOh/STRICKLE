import { describe, expect, it } from "vitest";
import { historyOf } from "../enclave/history.ts";
import { profileOf } from "./support.ts";

describe("historyOf", () => {
  it("leaves out money the user moved or got back, so it never reaches the forecast or the history weeks", () => {
    const profile = profileOf({ history: [["2026-11-01", "1000", "deposit"], ["2026-11-02", "500", "transfer"], ["2026-11-03", "80", "refund"], ["2026-10-01", "700", "estimate"]] });
    expect(historyOf(profile).map((entry) => entry.source)).toEqual(["deposit", "estimate"]);
  });
});
