import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { type Address, type Hex, createPublicClient, createWalletClient, defineChain, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { payerRegistry } from "../src/client.ts";
import { categoryId, entryHash, loadPayers } from "../src/dataset.ts";

const PORT = 8564;
const RPC = `http://127.0.0.1:${PORT}`;
const chain = defineChain({ id: 31337, name: "local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const artifact = JSON.parse(readFileSync(new URL("../../../contracts/out/PayerRegistry.sol/PayerRegistry.json", import.meta.url), "utf8"));

let node: ChildProcess;
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain, transport: http(RPC) });
let registry: Address;
const write = async (functionName: string, args: unknown[]) => publicClient.waitForTransactionReceipt({ hash: await walletClient.writeContract({ address: registry, abi: artifact.abi, functionName, args } as never) });

beforeAll(async () => {
  node = spawn("arc-anvil", ["--network", "arc", "--port", String(PORT)], { stdio: "ignore" });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      execFileSync("arc-cast", ["chain-id", "--rpc-url", RPC], { stdio: "ignore" });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object as Hex, args: [account.address] } as never);
  registry = (await publicClient.waitForTransactionReceipt({ hash })).contractAddress as Address;
});

afterAll(() => {
  node?.kill();
});

describe("payer registry client", () => {
  const entry = loadPayers().find((candidate) => candidate.category === "dao") as ReturnType<typeof loadPayers>[number];

  it("reads a payer as known with its category after the dataset entry is added", async () => {
    const reader = payerRegistry(publicClient, registry);
    expect(await reader.isKnownPayer(entry.address)).toBe(false);
    expect(await reader.categoryOf(entry.address)).toBeNull();
    await write("add", [entry.address, categoryId(entry.category), entryHash(entry)]);
    expect(await reader.isKnownPayer(entry.address)).toBe(true);
    expect(await reader.categoryOf(entry.address)).toBe("dao");
  });

  it("stops reading it as known once it is revoked", async () => {
    await write("revoke", [entry.address]);
    const reader = payerRegistry(publicClient, registry);
    expect(await reader.isKnownPayer(entry.address)).toBe(false);
    expect(await reader.categoryOf(entry.address)).toBeNull();
  });

  it("keeps the dataset hash recomputable from the chain", async () => {
    await write("add", [entry.address, categoryId(entry.category), entryHash(entry)]);
    const [known, category, metadata] = (await publicClient.readContract({ address: registry, abi: artifact.abi, functionName: "entryOf", args: [getAddress(entry.address)] })) as [boolean, number, Hex, bigint];
    expect(known).toBe(true);
    expect(category).toBe(categoryId(entry.category));
    expect(metadata).toBe(entryHash(entry));
  });
});
