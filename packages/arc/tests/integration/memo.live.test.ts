import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { encodeMemoPayment, readMemoPayments } from "../../src/memo.ts";
import { networks } from "../../src/networks.ts";

const key = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" as const;
const network = networks.testnet;

// Spends the shared deployer key: it runs locally with the owner's go-ahead, never in CI.
describe.skipIf(!key)("a real Memo payment on Arc testnet", () => {
  it("is read back as exactly the payment that was sent", async () => {
    const account = privateKeyToAccount(key as `0x${string}`);
    const client = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
    const wallet = createWalletClient({ account, chain: network.chain, transport: http(network.rpcUrl) });
    const memoId = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as const;
    const call = encodeMemoPayment({ token: network.usdc, vault: VAULT, amount: 10_000n, memoId });
    const hash = await wallet.sendTransaction({ to: call.to, data: call.data });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(readMemoPayments(receipt, network.usdc)).toEqual([expect.objectContaining({ payer: account.address, vault: VAULT, amount: 10_000n, memoId })]);
  });
});
