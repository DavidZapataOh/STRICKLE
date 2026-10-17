// workflows/agent/tests/earn-quote.test.ts
import { readFileSync } from "node:fs";
import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { checkEarnBundle, earnBody, parseEarnQuote } from "../enclave/earn-quote.ts";
import { adapterAbi } from "../enclave/swap-quote.ts";

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/earn/${name}`, import.meta.url), "utf8"));
const VAULT = "0x00000000000000000000000000000000000000a1";
const STRANGER = "0x00000000000000000000000000000000000000f1";
const ADAPTER = "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b";
const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";
const USDC = "0x3600000000000000000000000000000000000000";
const OWNED = 3_000_000_000_000_000_000n;

type Step = { target: string; data: string; value: string; tokenIn: string; amountToApprove: string; tokenOut: string; minTokenOut: string };
type Bundle = { signature?: string; executionParams: { deadline: string; tokens: { token: string; beneficiary: string }[]; instructions: Step[] } };

/** The captured bundle names the deployer as beneficiary; the vault takes its place, as it does when the agent asks for its own vault. */
function bundle(name: "deposit.json" | "withdraw.json", mutate: (data: Bundle) => void = () => {}) {
  const response = structuredClone(load(name));
  for (const entry of response.data.executionParams.tokens) entry.beneficiary = VAULT;
  mutate(response.data);
  return response;
}
const deadlineOf = (name: "deposit.json" | "withdraw.json") => Number(load(name).data.executionParams.deadline);
const base = { vault: VAULT as `0x${string}`, earnVault: EARN as `0x${string}`, adapter: ADAPTER as `0x${string}`, usdc: USDC as `0x${string}`, ownedShares: OWNED };
const deposit = (response: unknown, over: Record<string, unknown> = {}) => checkEarnBundle({ ...base, response, deposit: true, assets: 1_000_000n, now: deadlineOf("deposit.json") - 600, ...over });
const withdraw = (response: unknown, over: Record<string, unknown> = {}) => checkEarnBundle({ ...base, response, deposit: false, assets: 1_999_999n, now: deadlineOf("withdraw.json") - 600, ...over });

describe("the request to Circle's Earn service", () => {
  it("names the vault, the wallet and the amount in human units on the service's chain", () => {
    expect(JSON.parse(earnBody({ vault: VAULT, earnVault: EARN, assets: 1_500_000n, chain: "ARC-TESTNET" }))).toEqual({ vaultAddress: EARN, amount: "1.5", address: VAULT, chain: "ARC-TESTNET" });
    expect(JSON.parse(earnBody({ vault: VAULT, earnVault: EARN, assets: 2_000_000n, chain: "ARC" })).amount).toBe("2");
  });
});

describe("the real deposit bundle", () => {
  it("passes and becomes the adapter's execute call with the exact amount as its only token input", () => {
    const response = bundle("deposit.json");
    const checked = deposit(response);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.data.startsWith("0xaa3e079c")).toBe(true);
    expect(checked.amount).toBe(1_000_000n);
    const decoded = decodeFunctionData({ abi: adapterAbi, data: checked.data });
    const [params, inputs, signature] = decoded.args as [{ deadline: bigint; instructions: { target: string }[] }, unknown[], string];
    expect(inputs).toEqual([{ permitType: 0, token: USDC, amount: 1_000_000n, permitCalldata: "0x" }]);
    expect(signature).toBe(response.data.signature);
    expect(params.deadline).toBe(BigInt(response.data.executionParams.deadline));
    expect(params.instructions).toHaveLength(1);
    expect(params.instructions[0].target.toLowerCase()).toBe(EARN.toLowerCase());
  });

  it("is refused when it aims at another contract, another function or another receiver", () => {
    expect(deposit(bundle("deposit.json", (data) => (data.executionParams.instructions[0].target = STRANGER)))).toEqual({ ok: false, reason: "target" });
    expect(deposit(bundle("deposit.json", (data) => (data.executionParams.instructions[0].data = `0xdeadbeef${data.executionParams.instructions[0].data.slice(10)}`)))).toEqual({ ok: false, reason: "selector" });
    const swapped = (data: Bundle) => (data.executionParams.instructions[0].data = `${data.executionParams.instructions[0].data.slice(0, -40)}${STRANGER.slice(2)}`);
    expect(deposit(bundle("deposit.json", swapped))).toEqual({ ok: false, reason: "receiver" });
  });

  it("is refused when the shares would go to someone else, or the tokens are not the pair", () => {
    expect(deposit(bundle("deposit.json", (data) => (data.executionParams.tokens[1].beneficiary = STRANGER)))).toEqual({ ok: false, reason: "beneficiary" });
    expect(deposit(bundle("deposit.json", (data) => (data.executionParams.instructions[0].tokenIn = STRANGER)))).toEqual({ ok: false, reason: "token" });
    expect(deposit(bundle("deposit.json", (data) => (data.executionParams.tokens[0].token = STRANGER)))).toEqual({ ok: false, reason: "token" });
  });

  it("is refused when the amount differs from what was asked, in the approval or in the call", () => {
    expect(deposit(bundle("deposit.json"), { assets: 1_000_001n })).toEqual({ ok: false, reason: "amount" });
    expect(deposit(bundle("deposit.json", (data) => (data.executionParams.instructions[0].amountToApprove = "999999")))).toEqual({ ok: false, reason: "amount" });
    const doubled = (data: Bundle) => (data.executionParams.instructions[0].data = `${data.executionParams.instructions[0].data.slice(0, 10)}${"0".repeat(63)}2${data.executionParams.instructions[0].data.slice(74)}`);
    expect(deposit(bundle("deposit.json", doubled))).toEqual({ ok: false, reason: "amount" });
  });

  it("is refused when its deadline is too close, too far or not a number", () => {
    const at = deadlineOf("deposit.json");
    expect(deposit(bundle("deposit.json"), { now: at - 60 })).toEqual({ ok: false, reason: "deadline" });
    expect(deposit(bundle("deposit.json"), { now: at - 7_200 })).toEqual({ ok: false, reason: "deadline" });
    expect(deposit(bundle("deposit.json", (data) => (data.executionParams.deadline = "soon")))).toEqual({ ok: false, reason: "shape" });
  });

  it("is refused when its shape is wrong, needs ether, carries two instructions or is not an object", () => {
    expect(deposit(bundle("deposit.json", (data) => delete data.signature))).toEqual({ ok: false, reason: "shape" });
    expect(deposit(bundle("deposit.json", (data) => (data.executionParams.instructions[0].value = "1")))).toEqual({ ok: false, reason: "shape" });
    expect(deposit(bundle("deposit.json", (data) => data.executionParams.instructions.push(data.executionParams.instructions[0])))).toEqual({ ok: false, reason: "shape" });
    expect(deposit(null)).toEqual({ ok: false, reason: "shape" });
    expect(deposit({ data: { executionParams: { instructions: [{}] } } })).toEqual({ ok: false, reason: "shape" });
  });
});

describe("the real withdrawal bundle", () => {
  it("passes and spends exactly the shares the bundle names", () => {
    const checked = withdraw(bundle("withdraw.json"));
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.amount).toBe(1_997_885_511_423_141_916n);
    const [, inputs] = decodeFunctionData({ abi: adapterAbi, data: checked.data }).args as [unknown, unknown[]];
    expect(inputs).toEqual([{ permitType: 0, token: EARN, amount: 1_997_885_511_423_141_916n, permitCalldata: "0x" }]);
  });

  it("is refused when it would redeem more shares than the box owns", () => {
    expect(withdraw(bundle("withdraw.json"), { ownedShares: 1_997_885_511_423_141_915n })).toEqual({ ok: false, reason: "amount" });
  });

  it("is refused for a wrong function, owner or beneficiary", () => {
    expect(withdraw(bundle("withdraw.json", (data) => (data.executionParams.instructions[0].data = `0x6e553f65${data.executionParams.instructions[0].data.slice(10)}`)))).toEqual({ ok: false, reason: "selector" });
    const owner = (data: Bundle) => (data.executionParams.instructions[0].data = `${data.executionParams.instructions[0].data.slice(0, -40)}${STRANGER.slice(2)}`);
    expect(withdraw(bundle("withdraw.json", owner))).toEqual({ ok: false, reason: "receiver" });
    expect(withdraw(bundle("withdraw.json", (data) => (data.executionParams.tokens[0].beneficiary = STRANGER)))).toEqual({ ok: false, reason: "beneficiary" });
  });
});

describe("the quote that carries the rate", () => {
  it("reads the yield in basis points from the real deposit quote", () => {
    expect(parseEarnQuote(load("deposit-quote.json"))).toEqual({ apyBps: 420 });
  });

  it("is zero when the answer has no usable rate", () => {
    expect(parseEarnQuote({ data: { currentApy: "high" } })).toEqual({ apyBps: 0 });
    expect(parseEarnQuote(null)).toEqual({ apyBps: 0 });
    expect(parseEarnQuote({ data: { currentApy: -1 } })).toEqual({ apyBps: 0 });
  });
});
