import { describe, expect, it } from "vitest";
import { amountToSend } from "../src/payments/amounts.ts";

const leg = { kind: "bridge", fees: [{ kind: "forwarder", amount: 16_000n }], speed: "fast", feeMode: "destination", gas: null, source: {} };
describe("amountToSend", () => {
  it("is the target for a receive-exact quote", () => {
    expect(amountToSend(100_000_000n, { exact: true, legs: [{ ...leg, feeMode: "source" }] } as never)).toBe(100_000_000n);
  });
  it("adds the transfer fees, rounded up to the cent, when they come out of the amount", () => {
    expect(amountToSend(100_000_000n, { exact: false, legs: [leg] } as never)).toBe(100_020_000n);
    expect(amountToSend(100_000_000n, { exact: false, legs: [{ ...leg, fees: [] }] } as never)).toBe(100_000_000n);
  });
});
