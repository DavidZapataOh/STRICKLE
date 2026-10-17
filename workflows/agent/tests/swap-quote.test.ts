import { readFileSync } from "node:fs";
import { expectedOut } from "@strickle/core";
import { decodeFunctionData, toFunctionSelector, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import type { SwapConfig } from "../config.ts";
import { adapterAbi, checkQuote, quoteBody } from "../enclave/swap-quote.ts";
import type { SwapIntent } from "../enclave/swap-plan.ts";

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/swap/${name}`, import.meta.url), "utf8"));
const testnet = load("swap-testnet.json");
const mainnet = load("swap-mainnet.json");
const abiFixture = load("adapter-execute-abi.json");
const feeds = load("feeds-mainnet.json");
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC_TESTNET = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const EURC_MAINNET = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const rate = { usdcUsd: 99_982_900n, eurcUsd: 112_353_511n };
const config: SwapConfig = { circleUrl: "https://api.circle.com", adapter: "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b", usdcFeed: "0x00000000000000000000000000000000000000f1", eurcFeed: "0x00000000000000000000000000000000000000f2", gas: "1500000", minUnits: "25000000", dailyCap: "5000000000", maxSlipBps: 100, ceilingBps: 200, sandboxFx: false, maxFeedAgeSeconds: 93_600 };
const expected = expectedOut("USDC", 1_000_000n, rate);
const intent: SwapIntent = { box: 2, boxKind: "payroll", assetIn: "USDC", amountIn: 1_000_000n, minOut: (expected * 9_900n) / 10_000n, expected, reason: "to-euros" };
const deadline = (fixture: typeof mainnet) => Number(fixture.transaction.executionParams.deadline);
const run = (response: unknown, over: { eurc?: string; now?: number; sandboxFx?: boolean; intent?: Partial<SwapIntent> } = {}) =>
  checkQuote({ response, vault: VAULT, intent: { ...intent, ...over.intent }, rate, now: over.now ?? deadline(mainnet) - 540, config: { ...config, sandboxFx: over.sandboxFx ?? false }, usdc: USDC, eurc: (over.eurc ?? EURC_MAINNET) as `0x${string}` });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const reason = (checked: ReturnType<typeof run>) => (checked.ok ? "ok" : checked.reason);

describe("quoteBody", () => {
  it("names the vault as sender and beneficiary and puts the minimum in as the stop limit", () => {
    expect(JSON.parse(quoteBody({ vault: VAULT, intent, chain: "Arc", usdc: USDC, eurc: EURC_MAINNET }))).toEqual({ tokenInAddress: USDC, tokenInChain: "Arc", tokenOutAddress: EURC_MAINNET, tokenOutChain: "Arc", fromAddress: VAULT, toAddress: VAULT, amount: "1000000", stopLimit: intent.minOut.toString(), provider: "lifi" });
  });
});

describe("checkQuote on Circle's real answers", () => {
  it("accepts the mainnet answer against the rate in force when it was captured", () => {
    expect(feeds.readAt).toBeGreaterThan(0);
    const checked = run(mainnet);
    expect(checked.ok).toBe(true);
  });

  it("accepts the testnet answer only with the sandbox allowance, because the pool pays about a third over reference", () => {
    const at = deadline(testnet) - 540;
    expect(reason(run(testnet, { eurc: EURC_TESTNET, now: at }))).toBe("better-than-reference");
    expect(reason(run(testnet, { eurc: EURC_TESTNET, now: at, sandboxFx: true }))).toBe("ok");
  });

  it("refuses a beneficiary that is not the vault", () => {
    const bad = clone(mainnet);
    bad.transaction.executionParams.tokens[0].beneficiary = "0x00000000000000000000000000000000000000ee";
    expect(reason(run(bad))).toBe("beneficiary");
  });

  it("refuses a token that is neither of the two", () => {
    const bad = clone(mainnet);
    bad.transaction.executionParams.instructions[1].tokenOut = "0x00000000000000000000000000000000000000ee";
    expect(reason(run(bad))).toBe("token");
  });

  it("refuses a deadline that is too close or too far", () => {
    expect(reason(run(mainnet, { now: deadline(mainnet) - 60 }))).toBe("deadline");
    expect(reason(run(mainnet, { now: deadline(mainnet) - 3_700 }))).toBe("deadline");
  });

  it("refuses an estimate below the minimum that is not already below the slippage bound", () => {
    expect(reason(run(mainnet, { intent: { minOut: BigInt(mainnet.estimatedAmount) + 1n } }))).toBe("below-minimum");
  });

  it("refuses an estimate two percent under the reference, and no setting relaxes that", () => {
    const bad = clone(mainnet);
    bad.estimatedAmount = ((expected * 98n) / 100n).toString();
    expect(reason(run(bad))).toBe("worse-than-reference");
    expect(reason(run(bad, { sandboxFx: true }))).toBe("worse-than-reference");
  });

  it("refuses a body with a missing field", () => {
    const bad = clone(mainnet);
    delete bad.transaction.signature;
    expect(reason(run(bad))).toBe("shape");
    expect(reason(run(null))).toBe("shape");
    expect(reason(run({}))).toBe("shape");
  });

  it("builds the adapter's calldata from the answer and a single token input of the exact amount", () => {
    const checked = run(mainnet);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.data.slice(0, 10)).toBe("0xaa3e079c");
    const decoded = decodeFunctionData({ abi: adapterAbi, data: checked.data as Hex });
    const [params, inputs, signature] = decoded.args as [{ instructions: { target: string; minTokenOut: bigint }[]; tokens: { beneficiary: string }[]; execId: bigint; deadline: bigint }, { permitType: number; token: string; amount: bigint; permitCalldata: string }[], string];
    const wire = mainnet.transaction.executionParams;
    expect(params.instructions.map((i) => i.target)).toEqual(wire.instructions.map((i: { target: string }) => i.target));
    expect(params.instructions.map((i) => i.minTokenOut)).toEqual(wire.instructions.map((i: { minTokenOut: string }) => BigInt(i.minTokenOut)));
    expect(params.execId).toBe(BigInt(wire.execId));
    expect(params.deadline).toBe(BigInt(wire.deadline));
    expect(signature).toBe(mainnet.transaction.signature);
    expect(inputs).toEqual([{ permitType: 0, token: USDC, amount: 1_000_000n, permitCalldata: "0x" }]);
    expect(checked.gasLimit).toBe(BigInt(mainnet.transaction.gasLimit));
  });

  it("uses the selector of the verified adapter's execute", () => {
    const fn = abiFixture[0];
    expect(toFunctionSelector(fn)).toBe("0xaa3e079c");
    expect(toFunctionSelector(adapterAbi[0])).toBe("0xaa3e079c");
  });
});
