import { describe, expect, it } from "vitest";
import { usdcFromDollars } from "../src/usdc.ts";

describe("usdcFromDollars", () => {
  it("reads decimal dollars into six-decimal base units", () => {
    expect(usdcFromDollars("5", "x")).toBe(5_000_000n);
    expect(usdcFromDollars("2000.5", "x")).toBe(2_000_500_000n);
    expect(usdcFromDollars("0.000001", "x")).toBe(1n);
  });

  it.each(["", "lots", "-5", "1e3", "1.1234567", "0", "0.0"])("refuses %j", (value) => {
    expect(() => usdcFromDollars(value, "LIMIT")).toThrow(/LIMIT/);
  });
});
