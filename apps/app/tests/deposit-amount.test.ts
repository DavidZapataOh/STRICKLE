import { describe, expect, it } from "vitest";
import { formatTokenAmount, parseAmountInput } from "../src/deposit/amount.ts";

describe("parseAmountInput", () => {
  it("reads whole and decimal amounts as six-decimal units", () => {
    expect(parseAmountInput("25")).toBe(25_000_000n);
    expect(parseAmountInput("25.5")).toBe(25_500_000n);
    expect(parseAmountInput("25.123456")).toBe(25_123_456n);
    expect(parseAmountInput("0.01")).toBe(10_000n);
    expect(parseAmountInput("5.")).toBe(5_000_000n);
    expect(parseAmountInput(".5")).toBe(500_000n);
    expect(parseAmountInput("1000000000")).toBe(1_000_000_000_000_000n);
  });

  it("refuses everything else", () => {
    for (const text of ["", "0", "0.000001", "25.1234567", "-1", "1e3", "1,5", " 5", "5 ", "1000000001", ".", "1.2.3", "0x10"]) expect(parseAmountInput(text), text).toBeNull();
  });
});

describe("formatTokenAmount", () => {
  it("rounds to two decimals with the locale's separator and the symbol after", () => {
    expect(formatTokenAmount(99_346_534n, "USDT", "en")).toBe("99.35 USDT");
    expect(formatTokenAmount(99_346_534n, "USDT", "pt-br")).toBe("99,35 USDT");
    expect(formatTokenAmount(99_346_534n, "USDT", "es")).toBe("99.35 USDT");
    expect(formatTokenAmount(1_000_000_000n, "USDC", "en")).toBe("1,000.00 USDC");
    expect(formatTokenAmount(5_000n, "USDC", "en")).toBe("0.01 USDC");
  });
});
