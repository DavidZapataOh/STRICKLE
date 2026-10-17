import { type Address, createPublicClient, http, parseUnits } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { walletsClient } from "../../src/circle.ts";
import { networks } from "../../src/networks.ts";

const network = networks.testnet;
const publicClient = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
const ONE_USDC_NATIVE = parseUnits("1", 18);
const TERMINAL_FAILURES = ["FAILED", "CANCELLED", "DENIED"];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

describe.skipIf(!process.env.CIRCLE_API_KEY_TESTNET && !process.env.REQUIRE_CIRCLE)("Gas Station on Arc Testnet (live)", () => {
  let circle: ReturnType<typeof walletsClient>;

  // Created in a hook: a skipped suite still runs its body, and the client needs credentials.
  beforeAll(() => {
    circle = walletsClient("testnet");
  });

  async function addressOf(walletId: string): Promise<Address> {
    const address = (await circle.getWallet({ id: walletId })).data?.wallet?.address;
    if (!address) throw new Error(`wallet ${walletId} has no address`);
    return address as Address;
  }

  async function sendOneUsdc(from: Address, to: Address): Promise<bigint> {
    const created = await circle.createTransaction({
      blockchain: network.circleBlockchain,
      walletAddress: from,
      destinationAddress: to,
      tokenAddress: network.usdc,
      amount: ["1"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const id = created.data?.id;
    if (!id) throw new Error("createTransaction returned no id");

    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const tx = (await circle.getTransaction({ id })).data?.transaction;
      if (tx?.state === "COMPLETE" && tx.txHash) {
        return (await publicClient.getTransactionReceipt({ hash: tx.txHash as `0x${string}` })).blockNumber;
      }
      if (tx && TERMINAL_FAILURES.includes(tx.state)) throw new Error(`transaction ended in state ${tx.state}`);
    }
    throw new Error("transaction did not complete in time");
  }

  async function nativeSpent(address: Address, blockNumber: bigint): Promise<bigint> {
    const [before, after] = await Promise.all([
      publicClient.getBalance({ address, blockNumber: blockNumber - 1n }),
      publicClient.getBalance({ address, blockNumber }),
    ]);
    return before - after;
  }

  it("charges a smart-contract account exactly the amount sent, with no gas", async () => {
    const sca = await addressOf(required("CIRCLE_GAS_STATION_SCA_WALLET_ID"));
    const eoa = await addressOf(required("CIRCLE_GAS_STATION_EOA_WALLET_ID"));
    const block = await sendOneUsdc(sca, eoa);
    expect(await nativeSpent(sca, block)).toBe(ONE_USDC_NATIVE);
  });

  it("charges an externally owned account the amount plus gas (control)", async () => {
    const sca = await addressOf(required("CIRCLE_GAS_STATION_SCA_WALLET_ID"));
    const eoa = await addressOf(required("CIRCLE_GAS_STATION_EOA_WALLET_ID"));
    const block = await sendOneUsdc(eoa, sca);
    const spent = await nativeSpent(eoa, block);
    expect(spent).toBeGreaterThan(ONE_USDC_NATIVE);
    // the gas price moves with the network: the control only has to show that an externally owned account pays gas on top
    expect(spent).toBeLessThan(parseUnits("1.1", 18));
  });
});
