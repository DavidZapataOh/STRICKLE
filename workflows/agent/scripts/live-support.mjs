// workflows/agent/scripts/live-support.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, getAddress, http, parseAbi, parseAbiItem } from "viem";
import { executeSponsored, networks, walletsClient } from "@strickle/arc";
import { seal } from "@strickle/prover/sealed";
import { profileAad } from "../enclave/keys.ts";
import { encodeProfile } from "../enclave/profile.ts";

export const abi = {
  state: parseAbi([
    "function enclaveKey() view returns (bytes32)",
    "function submitProfile(address vault, bytes sealed)",
    "function head(address vault) view returns (uint64 version, uint64 at, uint64 applied)",
  ]),
  executor: parseAbi(["function register(address vault)", "function registered(address vault) view returns (bool)"]),
  vault: parseAbi([
    "function setAgent(address agent, uint128 cap, uint32 window)",
    "function revokeAgent()",
    "function boxBalance(uint8 asset, uint8 box) view returns (uint256)",
    "function unallocated(uint8 asset) view returns (uint256)",
    "function withdraw(uint8 asset, uint8 box, uint256 amount, address to)",
  ]),
  factory: parseAbi(["function create(address owner) returns (address)", "function vaultOf(address owner) view returns (address)"]),
};
const updated = parseAbiItem("event StateUpdated(address indexed vault, uint64 indexed version, bytes ciphertext)");

export async function context() {
  const network = networks.testnet;
  const contracts = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8")).contracts;
  const publicClient = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
  const circle = walletsClient("testnet");
  const walletId = process.env.CIRCLE_GAS_STATION_SCA_WALLET_ID;
  const owner = (await circle.getWallet({ id: walletId })).data.wallet.address;
  let vault = getAddress(await publicClient.readContract({ address: contracts.BoxVaultFactory.address, abi: abi.factory, functionName: "vaultOf", args: [owner] }));
  const call = (contract, contractAbi, functionName, args) => executeSponsored({ circle, publicClient, network, walletId, contract, abi: contractAbi, functionName, args });
  if (/^0x0+$/.test(vault)) {
    await call(contracts.BoxVaultFactory.address, abi.factory, "create", [owner]);
    vault = getAddress(await publicClient.readContract({ address: contracts.BoxVaultFactory.address, abi: abi.factory, functionName: "vaultOf", args: [owner] }));
  }
  return { network, contracts, publicClient, circle, walletId, owner, vault, call };
}

export async function readState(ctx) {
  const address = ctx.contracts.AgentState.address;
  const [version, at, applied] = await ctx.publicClient.readContract({ address, abi: abi.state, functionName: "head", args: [ctx.vault] });
  if (version === 0n) return { version, applied, ciphertext: undefined };
  const [event] = await ctx.publicClient.getLogs({ address, event: updated, args: { vault: ctx.vault, version }, fromBlock: at, toBlock: at });
  return { version, applied, ciphertext: Buffer.from(event.args.ciphertext.slice(2), "hex") };
}

export async function submitProfile(ctx, profile) {
  const address = ctx.contracts.AgentState.address;
  const key = await ctx.publicClient.readContract({ address, abi: abi.state, functionName: "enclaveKey" });
  const { applied: before } = await readState(ctx);
  const sealed = seal(encodeProfile(profile), Buffer.from(key.slice(2), "hex"), profileAad(ctx.vault));
  await ctx.call(address, abi.state, "submitProfile", [ctx.vault, `0x${Buffer.from(sealed).toString("hex")}`]);
  await waitFor(async () => (await readState(ctx)).applied > before, "the enclave to publish the profile's state");
}

export async function waitFor(check, what, seconds = 300) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 5) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`timed out waiting for ${what}`);
}
