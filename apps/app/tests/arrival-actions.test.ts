import { describe, expect, it } from "vitest";
import { expectAction, reclassifyAction } from "../src/agent/arrival-actions.ts";

const quote = (min: bigint, max: bigint) => ({ amountReceivedMin: min, amountSent: max }) as never;
const ME = "0x00000000000000000000000000000000000000a1" as const;

describe("expectAction", () => {
  it("takes the window from the quote: exact when the quote is exact, a floor and the amount sent otherwise", () => {
    expect(expectAction({ quote: quote(25_000_000n, 25_000_000n), id: "dep-1" })).toMatchObject({ kind: "expect", asset: "USDC", min: "25000000", max: "25000000", expiresInSeconds: 7_200 });
    expect(expectAction({ quote: quote(24_900_000n, 25_000_000n), id: "dep-1" })).toMatchObject({ min: "24900000", max: "25000000" });
  });
  it("passes the sender through only when given, and keeps the id within the schema", () => {
    expect(expectAction({ quote: quote(1n, 2n), id: "dep-1", from: ME }).from).toBe(ME);
    expect("from" in expectAction({ quote: quote(1n, 2n), id: "dep-1" })).toBe(false);
    expect(expectAction({ quote: quote(1n, 2n), id: "ABCDEFGHIJKLMNOP" }).id).toMatch(/^[a-z0-9-]{1,12}$/);
  });
});

describe("reclassifyAction", () => {
  it("carries the address to learn only when there is one", () => {
    expect(reclassifyAction({ arrivalId: "a1b2c3d4e5-0", to: "own-transfer", learn: ME })).toEqual({ kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to: "own-transfer", learn: ME });
    expect(reclassifyAction({ arrivalId: "a1b2c3d4e5-0", to: "income" })).toEqual({ kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to: "income" });
  });
});
