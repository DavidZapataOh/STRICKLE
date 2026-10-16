import { readFileSync } from "node:fs";
import { decodeFunctionData, getAddress, keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { MEMO_ADDRESS, encodeMemoPayment, memoAbi, readMemoPayments } from "../src/memo.ts";
import { networks } from "../src/networks.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/memo/${name}`, import.meta.url), "utf8"));
const receipt = fixture("payment.json");
const { input } = fixture("input.json");
const USDC = networks.testnet.usdc;

describe("readMemoPayments against a real Memo transaction", () => {
  const [payment] = readMemoPayments(receipt, USDC);

  it("finds exactly one payment, from the sender of the transaction", () => {
    expect(readMemoPayments(receipt, USDC)).toHaveLength(1);
    expect(payment?.payer).toBe(getAddress(receipt.from));
    expect(payment?.token).toBe(USDC);
  });

  it("takes recipient, amount and memo id from the call, and binds them to the call-data hash", () => {
    const { args } = decodeFunctionData({ abi: memoAbi, data: input });
    const [target, data, memoId] = args as unknown as [string, `0x${string}`, `0x${string}`];
    expect(getAddress(target)).toBe(USDC);
    expect(payment?.memoId).toBe(memoId);
    const memoLog = receipt.logs.find((log: { address: string; topics: string[] }) => getAddress(log.address) === MEMO_ADDRESS && log.topics.length === 4);
    expect(memoLog.data.includes(keccak256(data).slice(2))).toBe(true);
    expect(payment?.amount).toBeGreaterThan(0n);
  });

  it("points at the token's own transfer log, never at the system emitter's", () => {
    const log = receipt.logs.find((entry: { logIndex: number }) => entry.logIndex === payment?.transferLogIndex);
    expect(getAddress(log.address)).toBe(USDC);
  });

  it("ignores a Memo for another token", () => {
    expect(readMemoPayments(receipt, networks.testnet.eurc)).toEqual([]);
  });

  it("ignores a Memo whose transfer is not backed by the call-data hash", () => {
    const forged = structuredClone(receipt);
    const memo = forged.logs.find((log: { address: string; topics: string[] }) => getAddress(log.address) === MEMO_ADDRESS && log.topics.length === 4);
    memo.data = memo.data.replace(/^0x[0-9a-f]{64}/, `0x${"00".repeat(32)}`); // a different callDataHash
    expect(readMemoPayments(forged, USDC)).toEqual([]);
  });

  it("ignores a Memo that has no transfer of the token inside it", () => {
    const stripped = structuredClone(receipt);
    stripped.logs = stripped.logs.filter((log: { address: string }) => getAddress(log.address) !== USDC);
    expect(readMemoPayments(stripped, USDC)).toEqual([]);
  });
});

describe("encodeMemoPayment", () => {
  it("wraps a USDC transfer to the vault in a call to the Memo contract", () => {
    const vault = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
    const memoId = `0x${"ab".repeat(32)}` as const;
    const call = encodeMemoPayment({ token: USDC, vault, amount: 25_000_000n, memoId });
    expect(call.to).toBe(MEMO_ADDRESS);
    const decoded = decodeFunctionData({ abi: memoAbi, data: call.data });
    expect(decoded.functionName).toBe("memo");
    expect(decoded.args?.[2]).toBe(memoId);
    expect(decoded.args?.[3]).toBe("0x");
  });

  it("rejects a zero amount and a memo id that is not 32 bytes", () => {
    const vault = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
    expect(() => encodeMemoPayment({ token: USDC, vault, amount: 0n, memoId: `0x${"ab".repeat(32)}` })).toThrow();
    expect(() => encodeMemoPayment({ token: USDC, vault, amount: 1n, memoId: "0x12" })).toThrow();
  });
});
