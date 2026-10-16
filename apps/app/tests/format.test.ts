import { describe, expect, it } from "vitest";
import { isoDay, shortAddress, shortDigest } from "../src/activity/format.ts";

describe("format", () => {
  it("abbreviates an address and a digest without losing the ends", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    expect(shortDigest(`0x${"ab".repeat(32)}`)).toBe("abababab…abababab");
  });

  it("turns epoch seconds into a UTC calendar day", () => {
    expect(isoDay(1_796_083_200)).toBe("2026-12-01");
    expect(isoDay(1_796_083_199)).toBe("2026-11-30");
  });
});
