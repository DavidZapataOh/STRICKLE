import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { estimateSimple, loadRules, parseLocal, simpleAnnualDeclarationDate } from "../src/index.ts";

const rule = loadRules(new URL("../rules", import.meta.url).pathname).find((r) => r.id === "co-simple-professional")!;
const m = parseLocal;
const uvt = (n: number) => BigInt(n) * m("52374");

const run = (annualIncome: bigint, bimester = 4, bimesterIncome = m("1000000")) => {
  const result = estimateSimple(rule, { annualIncome, bimester, bimesterIncome });
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
};

describe("estimateSimple: rate by annual gross income in UVT", () => {
  it.each([
    [0, 590],
    [5999, 590],
    [6000, 730],
    [14999, 730],
    [15000, 1200],
    [29999, 1200],
    [30000, 1450],
    [99999, 1450],
  ])("%i UVT pays %i bps", (units, bps) => {
    expect(run(uvt(units)).rateBps).toBe(bps);
  });

  it("puts COP 314,243,999.99 below the 6,000 UVT edge", () => {
    expect(run(m("314243999.99")).rateBps).toBe(590);
    expect(run(m("314244000")).rateBps).toBe(730);
  });

  it("is out of regime from 100,000 UVT", () => {
    expect(estimateSimple(rule, { annualIncome: uvt(100000), bimester: 4, bimesterIncome: 0n }).status).toBe("out-of-regime");
  });
});

describe("estimateSimple: bimonthly advance", () => {
  it("is the rate times the bimester income", () => {
    expect(run(uvt(10000), 4, m("20000000")).advance).toBe(m("1460000"));
  });

  it("keeps cents exactly", () => {
    expect(run(uvt(4000), 4, m("333.33")).advance).toBe(m("19.67"));
  });

  it("is not required below 3,500 UVT", () => {
    const result = run(uvt(3499));
    expect(result.advanceRequired).toBe(false);
    expect(result.advance).toBe(0n);
    expect(run(uvt(3500)).advanceRequired).toBe(true);
  });

  it.each([
    [1, "2026-05-12", "2026-05-26"],
    [2, "2026-06-10", "2026-06-24"],
    [3, "2026-07-09", "2026-07-24"],
    [4, "2026-09-09", "2026-09-22"],
  ])("bimester %i has its published window", (bimester, from, to) => {
    const window = run(uvt(10000), bimester).window;
    expect(window).toEqual({ from: expect.objectContaining(parseIso(from)), to: expect.objectContaining(parseIso(to)) });
  });

  it("has no window for a bimester DIAN has not published, and says so", () => {
    const result = run(uvt(10000), 5);
    expect(result.window).toBeNull();
  });

  it("rejects bimesters outside 1 to 6 and negative income", () => {
    expect(() => run(uvt(10000), 7)).toThrow(RangeError);
    expect(() => run(uvt(10000), 0)).toThrow(RangeError);
    expect(() => estimateSimple(rule, { annualIncome: -1n, bimester: 1, bimesterIncome: 0n })).toThrow(RangeError);
  });
});

describe("simpleAnnualDeclarationDate", () => {
  it.each([
    [1, "2026-04-20"],
    [2, "2026-04-20"],
    [3, "2026-04-21"],
    [8, "2026-04-23"],
    [9, "2026-04-24"],
    [0, "2026-04-24"],
  ])("NIT ending %i files on %s", (digit, date) => {
    expect(simpleAnnualDeclarationDate(rule, digit)).toEqual(expect.objectContaining(parseIso(date)));
  });

  it("rejects a digit that is not 0 to 9", () => {
    expect(() => simpleAnnualDeclarationDate(rule, 10)).toThrow(RangeError);
    expect(() => simpleAnnualDeclarationDate(rule, -1)).toThrow(RangeError);
  });
});

function parseIso(text: string) {
  const [year, month, day] = text.split("-").map(Number) as [number, number, number];
  return plainDate(year, month, day);
}
