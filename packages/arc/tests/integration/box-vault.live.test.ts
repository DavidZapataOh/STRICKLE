import { readFileSync } from "node:fs";
import { type Address, createPublicClient, http, parseAbi, parseUnits } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { walletsClient } from "../../src/circle.ts";
import { networks } from "../../src/networks.ts";
import { executeSponsored } from "../../src/sponsored.ts";

const network = networks.testnet;
const publicClient = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
const manifest = JSON.parse(readFileSync(new URL("../../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8"));
const factory = manifest.contracts.BoxVaultFactory?.address as Address;

const factoryAbi = parseAbi(["function create(address owner) returns (address)", "function vaultOf(address owner) view returns (address)"]);
const vaultAbi = parseAbi([
  "function setAgent(address agent, uint128 cap, uint32 window)",
  "function pauseAgent()",
  "function resumeAgent()",
  "function split(uint8 asset, uint8[] boxes, uint256[] amounts)",
  "function proposeLargePayment(uint8 asset, uint8 box, address to, uint256 amount, bytes32 memo) returns (uint256)",
  "function rejectProposal(uint256 id)",
  "function nextProposalId() view returns (uint256)",
  "function boxBalance(uint8 asset, uint8 box) view returns (uint256)",
  "function unallocated(uint8 asset) view returns (uint256)",
  "function allocate(uint8 asset, uint8[] boxes, uint256[] amounts)",
  "function withdraw(uint8 asset, uint8 box, uint256 amount, address to)",
]);
const OPERATING = 4;
const PROFIT = 6;
const USDC = 1;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

describe.skipIf((!process.env.CIRCLE_API_KEY_TESTNET && !process.env.REQUIRE_CIRCLE) || !factory)("Box vault with sponsored smart accounts (live)", () => {
  let circle: ReturnType<typeof walletsClient>;
  let owner: Address;
  let agent: Address;
  const ownerWalletId = () => required("CIRCLE_GAS_STATION_SCA_WALLET_ID");
  const agentWalletId = () => required("CIRCLE_AGENT_SCA_WALLET_ID");

  beforeAll(async () => {
    circle = walletsClient("testnet");
    const address = async (id: string) => (await circle.getWallet({ id })).data?.wallet?.address as Address;
    owner = await address(ownerWalletId());
    agent = await address(agentWalletId());
  });

  const call = (walletId: string, contract: Address, abi: typeof vaultAbi | typeof factoryAbi, functionName: string, args: unknown[]) =>
    executeSponsored({ circle, publicClient, network, walletId, contract, abi, functionName, args });

  it("runs the whole role of the user and the agent with neither holding a gas token", { timeout: 600_000 }, async () => {
    let vault = (await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "vaultOf", args: [owner] })) as Address;
    const fees: bigint[] = [];
    if (/^0x0+$/.test(vault)) {
      fees.push((await call(ownerWalletId(), factory, factoryAbi, "create", [owner])).feePaid);
      vault = (await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "vaultOf", args: [owner] })) as Address;
    }
    expect(vault).not.toMatch(/^0x0+$/);

    const ownerBefore = await publicClient.getBalance({ address: owner });
    const agentBefore = await publicClient.getBalance({ address: agent });

    // the user funds the vault with 1 USDC (the only thing that may leave their balance)
    const funded = await circle.createTransaction({
      blockchain: network.circleBlockchain,
      walletAddress: owner,
      destinationAddress: vault,
      tokenAddress: network.usdc,
      amount: ["1"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const fundId = funded.data?.id as string;
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const tx = (await circle.getTransaction({ id: fundId })).data?.transaction;
      if (tx?.state === "COMPLETE") break;
      if (tx && ["FAILED", "CANCELLED", "DENIED"].includes(tx.state)) throw new Error(`funding ended in ${tx.state}`);
    }

    fees.push((await call(ownerWalletId(), vault, vaultAbi, "setAgent", [agent, parseUnits("100", 6), 86_400])).feePaid);

    const operatingBefore = (await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "boxBalance", args: [USDC, OPERATING] })) as bigint;
    fees.push((await call(agentWalletId(), vault, vaultAbi, "split", [USDC, [OPERATING, PROFIT], [600_000n, 400_000n]])).feePaid);
    const operatingAfter = (await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "boxBalance", args: [USDC, OPERATING] })) as bigint;
    expect(operatingAfter - operatingBefore).toBe(600_000n);

    // one tap pauses the agent: its next action fails
    fees.push((await call(ownerWalletId(), vault, vaultAbi, "pauseAgent", [])).feePaid);
    await expect(call(agentWalletId(), vault, vaultAbi, "split", [USDC, [OPERATING], [1n]])).rejects.toThrow();
    fees.push((await call(ownerWalletId(), vault, vaultAbi, "resumeAgent", [])).feePaid);

    // the agent proposes a payment, the user rejects it
    const proposalId = (await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "nextProposalId" })) as bigint;
    fees.push((await call(agentWalletId(), vault, vaultAbi, "proposeLargePayment", [USDC, PROFIT, owner, 1n, `0x${"11".repeat(32)}`])).feePaid);
    fees.push((await call(ownerWalletId(), vault, vaultAbi, "rejectProposal", [proposalId])).feePaid);

    const ownerAfter = await publicClient.getBalance({ address: owner });
    const agentAfter = await publicClient.getBalance({ address: agent });
    expect(ownerBefore - ownerAfter).toBe(parseUnits("1", 18));
    expect(agentAfter).toBe(agentBefore);

    // give the test money back: the vault is the owner's for good, so every run would otherwise strand a USDC in it
    const read = (functionName: "boxBalance" | "unallocated", args: readonly unknown[]) => publicClient.readContract({ address: vault, abi: vaultAbi, functionName, args } as never) as Promise<bigint>;
    const idle = await read("unallocated", [USDC]);
    if (idle > 0n) fees.push((await call(ownerWalletId(), vault, vaultAbi, "allocate", [USDC, [PROFIT], [idle]])).feePaid);
    for (const box of [OPERATING, PROFIT]) {
      const balance = await read("boxBalance", [USDC, box]);
      if (balance > 0n) fees.push((await call(ownerWalletId(), vault, vaultAbi, "withdraw", [USDC, box, balance, owner])).feePaid);
    }
    expect(await read("boxBalance", [USDC, OPERATING])).toBe(0n);
    expect(await read("boxBalance", [USDC, PROFIT])).toBe(0n);
    expect(await publicClient.getBalance({ address: owner })).toBe(ownerBefore);

    const sponsored = fees.reduce((sum, fee) => sum + fee, 0n);
    expect(sponsored).toBeGreaterThan(0n);
    console.log(`sponsored ${fees.length} transactions for ${sponsored} native base units (${Number(sponsored) / 1e18} USDC)`);
  });
});
