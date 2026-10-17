import { encodeFunctionResult, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { EARN_FIRST_READS, decodeEarnFirst, decodeEarnPreview, earnFirstReads, earnPreviewRead } from "../enclave/earn-reads.ts";

const VAULT = "0x00000000000000000000000000000000000000a1" as const;
const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88" as const;
const ADAPTER = "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b" as const;
const abi = parseAbi([
  "function vaultApprovedFrom(address vault) view returns (uint64)",
  "function sharesOf(address vault, uint8 box) view returns (uint256)",
  "function boxBalance(uint8 asset, uint8 box) view returns (uint256)",
  "function swapAdapter() view returns (address)",
  "function swapAdapterFrom() view returns (uint64)",
  "function swapSlippageBps() view returns (uint16)",
  "function previewDeposit(uint256 assets) view returns (uint256)",
  "function previewRedeem(uint256 shares) view returns (uint256)",
]);

describe("the reads for an Earn move", () => {
  it("are six eth_calls to the box vault, the first naming the yield vault and the box", () => {
    const reads = earnFirstReads(VAULT, EARN, 6);
    expect(reads).toHaveLength(EARN_FIRST_READS);
    expect(reads.every((read) => read.method === "eth_call")).toBe(true);
    expect((reads[0]?.params[0] as { to: string }).to).toBe(VAULT);
    expect(JSON.stringify(reads[1]?.params[0])).toContain(EARN.slice(2).toLowerCase());
  });

  it("decode the answers a vault gives", () => {
    const answers = [
      encodeFunctionResult({ abi, functionName: "vaultApprovedFrom", result: 1_900_000_000n }),
      encodeFunctionResult({ abi, functionName: "sharesOf", result: 3n * 10n ** 18n }),
      encodeFunctionResult({ abi, functionName: "boxBalance", result: 4_000_000_000n }),
      encodeFunctionResult({ abi, functionName: "swapAdapter", result: ADAPTER }),
      encodeFunctionResult({ abi, functionName: "swapAdapterFrom", result: 1_900_001_000n }),
      encodeFunctionResult({ abi, functionName: "swapSlippageBps", result: 100 }),
    ];
    expect(decodeEarnFirst(answers)).toEqual({ approvedFrom: 1_900_000_000n, owned: 3n * 10n ** 18n, box: 4_000_000_000n, adapter: { address: ADAPTER, from: 1_900_001_000n }, slippageBps: 100 });
  });

  it("ask the yield vault for the preview that fits the direction", () => {
    expect(JSON.stringify(earnPreviewRead(EARN, true, 1_000_000n, 5n).params[0])).toContain("0xef8b30f7");
    expect(JSON.stringify(earnPreviewRead(EARN, false, 1_000_000n, 5n).params[0])).toContain("0x4cdad506");
    expect(decodeEarnPreview(encodeFunctionResult({ abi, functionName: "previewDeposit", result: 998_942n }), true)).toBe(998_942n);
    expect(decodeEarnPreview(encodeFunctionResult({ abi, functionName: "previewRedeem", result: 3_003_174n }), false)).toBe(3_003_174n);
  });
});
