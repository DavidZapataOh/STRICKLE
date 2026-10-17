import { type BoxKind, plainDate } from "@strickle/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BOX_ID } from "../enclave/cascade.ts";
import { planSwap } from "../enclave/swap-plan.ts";
import type { Profile } from "../enclave/profile.ts";
import { profileOf } from "./support.ts";

const TODAY = plainDate(2026, 11, 10);
const rate = { usdcUsd: 100_000_000n, eurcUsd: 112_000_000n };
const config = { circleUrl: "https://api.circle.com", adapter: "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b", usdcFeed: "0x00000000000000000000000000000000000000f1", eurcFeed: "0x00000000000000000000000000000000000000f2", gas: "1500000", minUnits: "25000000", dailyCap: "5000000000", maxSlipBps: 100, ceilingBps: 200, sandboxFx: false, maxFeedAgeSeconds: 93_600 };
const zero = (): Record<BoxKind, bigint> => ({ taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 0n });
const raw = (usdc: Partial<Record<BoxKind, bigint>> = {}, eurc: Partial<Record<BoxKind, bigint>> = {}) => ({ usdc: { ...zero(), ...usdc }, eurc: { ...zero(), ...eurc } });
const euro = (over: Partial<Profile["currencies"]> = {}, rest: Partial<Profile> = {}) => profileOf({ currencies: { payroll: "USD", operating: "USD", emergency: "USD", profit: "USD", ...over }, ...rest });
const plan = (profile: Profile, balances: ReturnType<typeof raw>) => planSwap({ profile, raw: balances, rate, today: TODAY, config });

describe("planSwap", () => {
  it("converts a euro box holding dollars into euros, all of it up to the daily cap left", () => {
    const intent = plan(euro({ payroll: "EUR" }), raw({ payroll: 400_000_000n }));
    expect(intent).toMatchObject({ box: BOX_ID.payroll, boxKind: "payroll", assetIn: "USDC", amountIn: 400_000_000n, reason: "to-euros" });
  });

  it("converts a dollar box holding euros back to dollars", () => {
    const intent = plan(euro(), raw({}, { operating: 300_000_000n }));
    expect(intent).toMatchObject({ box: BOX_ID.operating, assetIn: "EURC", amountIn: 300_000_000n, reason: "to-dollars" });
  });

  it("never swaps dollars held in taxes or the salary into euros, whatever the settings say", () => {
    expect(plan(euro({ payroll: "EUR", operating: "EUR", emergency: "EUR", profit: "EUR" }), raw({ taxes: 900_000_000n, salary: 900_000_000n }))).toEqual({ skip: "nothing-to-do" });
  });

  it("brings euros that income in euros left in taxes or the salary back to dollars, after the four boxes", () => {
    expect(plan(euro(), raw({}, { taxes: 900_000_000n }))).toMatchObject({ box: BOX_ID.taxes, boxKind: "taxes", assetIn: "EURC", reason: "to-dollars" });
    const both = plan(euro(), raw({}, { taxes: 900_000_000n, operating: 100_000_000n, salary: 900_000_000n }));
    expect(both).toMatchObject({ box: BOX_ID.operating });
    expect(plan(euro(), raw({}, { salary: 900_000_000n }))).toMatchObject({ box: BOX_ID.salary });
  });

  it("serves the boxes in the fixed order payroll, operating, emergency, profit", () => {
    const intent = plan(euro({ payroll: "EUR", operating: "EUR", profit: "EUR" }), raw({ operating: 100_000_000n, profit: 100_000_000n, payroll: 100_000_000n }));
    expect("box" in intent && intent.box).toBe(BOX_ID.payroll);
  });

  it("leaves a balance below the minimum alone", () => {
    expect(plan(euro({ payroll: "EUR" }), raw({ payroll: 24_999_999n }))).toEqual({ skip: "nothing-to-do" });
  });

  it("only converts what the daily cap still allows", () => {
    const spent = euro({ payroll: "EUR" }, { swap: { day: "2026-11-10", spent: "4800000000", failures: 0, since: "", heldOn: "" } });
    expect(plan(spent, raw({ payroll: 900_000_000n }))).toMatchObject({ amountIn: 200_000_000n });
    const full = euro({ payroll: "EUR" }, { swap: { day: "2026-11-10", spent: "5000000000", failures: 0, since: "", heldOn: "" } });
    expect(plan(full, raw({ payroll: 900_000_000n }))).toEqual({ skip: "daily-cap" });
    const yesterday = euro({ payroll: "EUR" }, { swap: { day: "2026-11-09", spent: "5000000000", failures: 0, since: "", heldOn: "" } });
    expect(plan(yesterday, raw({ payroll: 900_000_000n }))).toMatchObject({ amountIn: 900_000_000n });
  });

  it("stops after three failures and while the breaker is halted", () => {
    expect(plan(euro({ payroll: "EUR" }, { swap: { day: "", spent: "0", failures: 3, since: "", heldOn: "" } }), raw({ payroll: 400_000_000n }))).toEqual({ skip: "failures" });
    expect(plan(euro({ payroll: "EUR" }, { breaker: { halted: true, since: "2026-11-01", codes: [] } }), raw({ payroll: 400_000_000n }))).toEqual({ skip: "halted" });
  });

  it("waits a day after the currency setting changed", () => {
    const changed = euro({ payroll: "EUR" }, { swap: { day: "", spent: "0", failures: 0, since: "2026-11-10", heldOn: "" } });
    expect(plan(changed, raw({ payroll: 400_000_000n }))).toEqual({ skip: "nothing-to-do" });
  });

  it("asks for at least the feed price less the slippage, never below the vault's own bound", () => {
    const intent = plan(euro({ payroll: "EUR" }), raw({ payroll: 1_120_000_000n }));
    if (!("box" in intent)) throw new Error("expected a swap");
    expect(intent.expected).toBe((1_120_000_000n * 100_000_000n) / 112_000_000n);
    expect(intent.minOut).toBe((intent.expected * 9_900n) / 10_000n);
    const vaultBound = (1_120_000_000n * 100_000_000n * 9_850n) / (112_000_000n * 10_000n);
    expect(intent.minOut).toBeGreaterThanOrEqual(vaultBound);
  });

  it("never plans a swap for a profile whose boxes are all dollars and that holds no euros", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.bigInt({ min: 0n, max: 10n ** 12n }), (payroll, profit) => {
        expect(plan(euro(), raw({ payroll, profit }))).toEqual({ skip: "nothing-to-do" });
      }),
    );
  });

  it("never plans more than the box holds or the cap leaves, nor a minimum below the formula", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 25_000_000n, max: 10n ** 12n }), fc.bigInt({ min: 0n, max: 5_000_000_000n }), (balance, spent) => {
        const profile = euro({ payroll: "EUR" }, { swap: { day: "2026-11-10", spent: spent.toString(), failures: 0, since: "", heldOn: "" } });
        const intent = plan(profile, raw({ payroll: balance }));
        if (!("box" in intent)) return;
        expect(intent.amountIn).toBeLessThanOrEqual(balance);
        expect(intent.amountIn).toBeLessThanOrEqual(5_000_000_000n - spent);
        expect(intent.minOut).toBeGreaterThanOrEqual((intent.expected * 9_900n) / 10_000n);
      }),
    );
  });
});
