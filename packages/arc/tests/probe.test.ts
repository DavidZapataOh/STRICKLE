import { describe, expect, it } from "vitest";
import { type RpcCall, probeNetwork, usdcBalance } from "../src/probe.ts";

// Reality cannot produce a wrong chain id or a missing token on demand, so this transport is a stated double.
const endpoint =
  (answers: Record<string, unknown>): RpcCall =>
  async (method, params = []) => {
    const key = method === "eth_getCode" ? `${method}:${String(params[0]).toLowerCase()}` : method;
    if (!(key in answers)) throw new Error(`unexpected ${key}`);
    return answers[key];
  };

const USDC = "0x3600000000000000000000000000000000000000";
const EURC_MAINNET = "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1";
const good = { eth_chainId: "0x13b2", eth_blockNumber: "0x10", [`eth_getCode:${USDC}`]: "0x6080", [`eth_getCode:${EURC_MAINNET}`]: "0x60806040" };

describe("probeNetwork", () => {
  it("reads the chain id, the block height and the size of both tokens' code", async () => {
    expect(await probeNetwork("mainnet", { call: endpoint(good) })).toEqual({ network: "mainnet", chainId: 5042, blockNumber: 16n, usdcCodeBytes: 2, eurcCodeBytes: 4 });
  });

  it("refuses an endpoint that answers for another chain", async () => {
    await expect(probeNetwork("mainnet", { call: endpoint({ ...good, eth_chainId: "0x4cef52" }) })).rejects.toThrow("chain id mismatch on mainnet: expected 5042, the endpoint answered 5042002");
  });

  it("refuses a token without code", async () => {
    await expect(probeNetwork("mainnet", { call: endpoint({ ...good, [`eth_getCode:${USDC}`]: "0x" }) })).rejects.toThrow(`USDC has no code at ${USDC} on mainnet`);
    await expect(probeNetwork("mainnet", { call: endpoint({ ...good, [`eth_getCode:${EURC_MAINNET}`]: "0x" }) })).rejects.toThrow("EURC has no code");
  });

  it("surfaces an RPC failure instead of reporting a half probe", async () => {
    const failing: RpcCall = async () => {
      throw new Error("rpc eth_chainId failed: rate limit exceeded");
    };
    await expect(probeNetwork("mainnet", { call: failing })).rejects.toThrow("rate limit exceeded");
  });
});

describe("usdcBalance", () => {
  const holder = "0x00000000000000000000000000000000000000a1";
  const call: RpcCall = async (method, params = []) => {
    expect(method).toBe("eth_call");
    const [{ to, data }] = params as [{ to: string; data: string }];
    expect(to.toLowerCase()).toBe(USDC);
    expect(data).toBe(`0x70a08231${"0".repeat(24)}${holder.slice(2)}`);
    return `0x${(5_250_000n).toString(16).padStart(64, "0")}`;
  };

  it("asks the token for balanceOf and returns six-decimal base units", async () => {
    expect(await usdcBalance("mainnet", holder, { call })).toBe(5_250_000n);
  });

  it("refuses an address that is not one and an answer with no data", async () => {
    await expect(usdcBalance("mainnet", "0x1234", { call })).rejects.toThrow(/address/);
    await expect(usdcBalance("mainnet", holder, { call: async () => "0x" })).rejects.toThrow(/no data/);
  });
});
