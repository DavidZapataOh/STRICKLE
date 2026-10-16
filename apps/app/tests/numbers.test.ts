import { describe, expect, it } from "vitest";
import { parseWholeDollars } from "../src/onboarding/numbers.ts";

describe("parseWholeDollars", () => {
  it("reads plain digits in every locale", () => {
    for (const locale of ["en", "es", "pt-br"] as const) expect(parseWholeDollars("3200", locale)).toBe(3200);
  });

  it("reads each locale's own thousands separator", () => {
    expect(parseWholeDollars("3,200", "en")).toBe(3200);
    expect(parseWholeDollars("3,200", "es")).toBe(3200);
    expect(parseWholeDollars("3.200", "pt-br")).toBe(3200);
    expect(parseWholeDollars("1.234.567", "pt-br")).toBe(1_234_567);
    expect(parseWholeDollars(" 1,234,567 ", "en")).toBe(1_234_567);
  });

  it("accepts a zero decimal part and refuses a real one", () => {
    expect(parseWholeDollars("3,200.00", "en")).toBe(3200);
    expect(parseWholeDollars("3.200,00", "pt-br")).toBe(3200);
    expect(parseWholeDollars("3.5", "en")).toBeNull();
    expect(parseWholeDollars("3,5", "pt-br")).toBeNull();
    expect(parseWholeDollars("3.200", "en")).toBeNull();
  });

  it("refuses badly grouped numbers, signs, exponents and garbage", () => {
    for (const bad of ["3,2", "3,2000", "-5", "1e3", "abc", "", "  ", "3 200 abc", "1,,000"]) expect(parseWholeDollars(bad, "en")).toBeNull();
  });
});
