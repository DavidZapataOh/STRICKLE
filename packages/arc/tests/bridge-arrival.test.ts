import { readFileSync } from "node:fs";
import { decodeEventLog, getAddress, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { creditedLog, creditedTo } from "../src/bridge/arrival.ts";

const USDC = "0x3600000000000000000000000000000000000000" as const;
const receipt = JSON.parse(readFileSync(new URL("./fixtures/bridge/arrival-receipt.json", import.meta.url), "utf8"));
const transfer = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const transfers = receipt.logs
  .filter((log: { address: string }) => getAddress(log.address) === USDC)
  .flatMap((log: { topics: `0x${string}`[]; data: `0x${string}` }) => {
    try {
      return [decodeEventLog({ abi: transfer, topics: log.topics as [`0x${string}`], data: log.data }).args];
    } catch {
      return [];
    }
  });
const last = transfers.at(-1) as { to: `0x${string}`; value: bigint };

describe("creditedTo", () => {
  it("counts what the USDC token credited to the vault in the forwarding transaction", () => {
    expect(creditedTo(receipt, USDC, last.to)).toBeGreaterThanOrEqual(last.value);
  });

  it("does not double count when Arc emits the same credit from two emitters", () => {
    const credited = creditedTo(receipt, USDC, last.to);
    const once = transfers.filter((t: { to: string }) => t.to === last.to).reduce((sum: bigint, t: { value: bigint }) => sum + t.value, 0n);
    expect(credited).toBeLessThanOrEqual(once);
  });

  it("is zero for an address that received nothing", () => {
    expect(creditedTo(receipt, USDC, "0x000000000000000000000000000000000000dEaD")).toBe(0n);
  });
});

describe("creditedLog", () => {
  it("gives each credit its own log index and sender, so a payment can be keyed by (transaction, log)", () => {
    const credits = creditedLog(receipt, USDC, last.to);
    expect(credits.length).toBeGreaterThan(0);
    for (const credit of credits) {
      expect(Number.isInteger(credit.logIndex)).toBe(true);
      expect(credit.from).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
    expect(credits.reduce((sum, credit) => sum + credit.amount, 0n)).toBe(creditedTo(receipt, USDC, last.to));
  });
});
