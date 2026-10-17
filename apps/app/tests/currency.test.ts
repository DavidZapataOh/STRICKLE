import { decodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { boxHoldings, conversionStatus, swapSetupCalls } from "../src/boxes/currency.ts";
import type { VaultState } from "../src/chain/totals.ts";
import { onboardingCalls } from "../src/onboarding/calls.ts";
import { currencyChange } from "../src/settings/adjust.ts";

const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const ADAPTER = "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b";
const swapAbi = parseAbi(["function approveSwapAdapter(address adapter)", "function setSwapCap(uint128 cap, uint32 window)"]);
const rule = { delaySeconds: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0 };
const box = (kind: VaultState["boxes"][number]["kind"], id: number, usdc: bigint, eurc: bigint, invested = 0n) => ({ kind, id, usdc, eurc, invested, rule });
const vault = (over: Partial<VaultState> = {}): VaultState => ({
  boxes: [box("taxes", 1, 100n, 0n), box("payroll", 2, 5n, 800n, 20n), box("salary", 3, 0n, 0n), box("operating", 4, 7n, 0n), box("emergency", 5, 0n, 0n), box("profit", 6, 0n, 3n)],
  unallocatedUsdc: 0n,
  agent: VAULT,
  agentPaused: false,
  now: 1_000_000,
  conversions: { supported: true, adapter: ADAPTER, from: 900_000, cap: 5_000_000_000n, window: 86_400 },
  ...over,
});

describe("currencyChange", () => {
  it.each(["payroll", "operating", "emergency", "profit"] as const)("builds the signed adjust for %s", (boxName) => {
    expect(currencyChange({ box: boxName, to: "EUR" })).toEqual({ ok: true, action: { kind: "adjust", changes: { currencies: { [boxName]: "EUR" } } } });
    expect(currencyChange({ box: boxName, to: "USD" })).toEqual({ ok: true, action: { kind: "adjust", changes: { currencies: { [boxName]: "USD" } } } });
  });
  it("refuses the salary, taxes and anything that is not a dollar or a euro", () => {
    expect(currencyChange({ box: "salary" as never, to: "EUR" })).toEqual({ ok: false, error: "box" });
    expect(currencyChange({ box: "taxes" as never, to: "EUR" })).toEqual({ ok: false, error: "box" });
    expect(currencyChange({ box: "payroll", to: "GBP" as never })).toEqual({ ok: false, error: "currency" });
  });
});

describe("boxHoldings", () => {
  it("lists the six boxes with the dollars and the euros each one holds, the part working in a yield vault counted as dollars", () => {
    const holdings = boxHoldings(vault());
    expect(holdings).toHaveLength(6);
    expect(holdings.find((entry) => entry.box === "payroll")).toEqual({ box: "payroll", usdc: 25n, eurc: 800n });
    expect(holdings.find((entry) => entry.box === "profit")).toEqual({ box: "profit", usdc: 0n, eurc: 3n });
  });
});

describe("swapSetupCalls", () => {
  it("approves Circle's adapter and sets the conversions' own daily cap, in that order", () => {
    const calls = swapSetupCalls(VAULT, ADAPTER);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.to === VAULT)).toBe(true);
    expect(decodeFunctionData({ abi: swapAbi, data: calls[0]?.data ?? "0x" })).toEqual({ functionName: "approveSwapAdapter", args: [ADAPTER] });
    expect(decodeFunctionData({ abi: swapAbi, data: calls[1]?.data ?? "0x" })).toEqual({ functionName: "setSwapCap", args: [5_000_000_000n, 86_400] });
  });
});

describe("a new account", () => {
  const args = { factory: "0x00000000000000000000000000000000000000f1", executor: "0x00000000000000000000000000000000000000f2", state: "0x00000000000000000000000000000000000000f3", vault: VAULT, owner: "0x00000000000000000000000000000000000000a1", capUnits: 1_000n, sealed: "0xaa", vaultExists: false } as const;
  it("ends its creation batch with the two swap calls when the vault can swap", () => {
    const plain = onboardingCalls(args);
    const calls = onboardingCalls({ ...args, swapCalls: swapSetupCalls(VAULT, ADAPTER) });
    expect(calls).toHaveLength(plain.length + 2);
    expect(calls.slice(-2)).toEqual(swapSetupCalls(VAULT, ADAPTER));
    expect(calls.slice(0, plain.length)).toEqual(plain);
  });
  it("is unchanged when the vault cannot swap", () => {
    expect(onboardingCalls({ ...args, swapCalls: [] })).toEqual(onboardingCalls(args));
  });
});

describe("conversionStatus", () => {
  it("is unavailable for a vault without swaps", () => {
    expect(conversionStatus(vault({ conversions: { supported: false } }), ADAPTER)).toEqual({ kind: "unavailable" });
  });
  it("offers to allow conversions when the vault can swap but has no adapter", () => {
    expect(conversionStatus(vault({ conversions: { supported: true, adapter: "0x0000000000000000000000000000000000000000", from: 0, cap: 0n, window: 0 } }), ADAPTER)).toEqual({ kind: "not-allowed" });
  });
  it("says when a conversion will be active, because the vault waits a day after the adapter is approved", () => {
    expect(conversionStatus(vault({ conversions: { supported: true, adapter: ADAPTER, from: 1_050_000, cap: 5_000_000_000n, window: 86_400 } }), ADAPTER)).toEqual({ kind: "pending", from: 1_050_000 });
  });
  it("is active with the cap the vault holds, read from the vault", () => {
    expect(conversionStatus(vault(), ADAPTER)).toEqual({ kind: "active", cap: 5_000_000_000n });
  });
  it("is unavailable for an adapter that is not Circle's, and when the owner set no cap", () => {
    expect(conversionStatus(vault({ conversions: { supported: true, adapter: "0x00000000000000000000000000000000000000ad", from: 900_000, cap: 5_000_000_000n, window: 86_400 } }), ADAPTER)).toEqual({ kind: "unavailable" });
    expect(conversionStatus(vault({ conversions: { supported: true, adapter: ADAPTER, from: 900_000, cap: 0n, window: 0 } }), ADAPTER)).toEqual({ kind: "not-allowed" });
  });
  it("is paused with the reason the agent gave, only while the vault could otherwise convert", () => {
    expect(conversionStatus(vault(), ADAPTER, "stale-feed")).toEqual({ kind: "paused", reason: "stale-feed", cap: 5_000_000_000n });
    expect(conversionStatus(vault({ conversions: { supported: false } }), ADAPTER, "stale-feed")).toEqual({ kind: "unavailable" });
  });
});

describe("settingsMatch with currencies", () => {
  const settings = { proposed: "1", day: 1, payee: VAULT as string, dailyCap: "1", signatureThreshold: "1", floorDays: 14, targetDays: 42, halted: false, haltCodes: [] as string[], currencies: { payroll: "EUR" as const, operating: "USD" as const, emergency: "USD" as const, profit: "USD" as const } };
  it("sees a currency in force only when the plan shows it", async () => {
    const { settingsMatch } = await import("../src/settings/adjust.ts");
    expect(settingsMatch({ currencies: { payroll: "EUR" } }, settings)).toBe(true);
    expect(settingsMatch({ currencies: { payroll: "USD" } }, settings)).toBe(false);
    expect(settingsMatch({ currencies: { profit: "EUR" } }, settings)).toBe(false);
    expect(settingsMatch({ currencies: { payroll: "EUR" } }, { ...settings, currencies: undefined })).toBe(false);
  });
});
