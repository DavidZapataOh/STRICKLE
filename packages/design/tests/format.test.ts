// packages/design/tests/format.test.ts
import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatPercent } from "../src/format.ts";

const usd = (dollars: number) => BigInt(Math.round(dollars * 1_000_000));

describe("formatMoney", () => {
  it("shows two decimals with the locale's grouping", () => {
    expect(formatMoney(usd(1800), "en")).toBe("US$1,800.00");
    expect(formatMoney(usd(1800), "es")).toBe("US$1,800.00");
    expect(formatMoney(usd(1234567.5), "pt-br")).toBe("US$ 1.234.567,50");
  });

  it("rounds half away from zero at the third decimal", () => {
    expect(formatMoney(1_005_000n, "en")).toBe("US$1.01");
    expect(formatMoney(1_004_999n, "en")).toBe("US$1.00");
    expect(formatMoney(-1_005_000n, "en")).toBe("−US$1.01");
  });

  it("never prints a minus sign for an amount that rounds to zero", () => {
    expect(formatMoney(-1n, "en")).toBe("US$0.00");
    expect(formatMoney(-4_999n, "en", { signed: true })).toBe("US$0.00");
    expect(formatMoney(-5_000n, "en")).toBe("\u2212US$0.01");
  });

  it("handles zero, signs and the euro stablecoin", () => {
    expect(formatMoney(0n, "en")).toBe("US$0.00");
    expect(formatMoney(usd(250), "en", { signed: true })).toBe("+US$250.00");
    expect(formatMoney(usd(-250), "en", { signed: true })).toBe("−US$250.00");
    expect(formatMoney(usd(10), "en", { asset: "EURC" })).toBe("€10.00");
  });

  it("is exact for amounts beyond 2^53 base units", () => {
    expect(formatMoney(9_007_199_254_740_993_000_000n, "en")).toBe("US$9,007,199,254,740,993.00");
  });
});

describe("formatDate", () => {
  it("formats the UTC calendar day without shifting it", () => {
    expect(formatDate("2026-12-01", "en")).toBe("Dec 1");
    expect(formatDate("2026-12-01", "es")).toBe("1 dic");
    expect(formatDate("2026-12-01", "pt-br")).toBe("1 de dez.");
    expect(formatDate("2026-12-01", "en", "long")).toBe("December 1, 2026");
  });

  it("rejects anything that is not a calendar date", () => {
    expect(() => formatDate("2026-12-01T00:00:00Z", "en")).toThrow();
    expect(() => formatDate("2026-13-40", "en")).toThrow();
  });
});

describe("formatPercent", () => {
  it("writes basis points as a percentage without trailing zeros", () => {
    expect(formatPercent(1800, "en")).toBe("18%");
    expect(formatPercent(1050, "en")).toBe("10.5%");
    expect(formatPercent(1050, "es")).toBe("10.5%");
    expect(formatPercent(1050, "pt-br")).toBe("10,5%");
  });
});
