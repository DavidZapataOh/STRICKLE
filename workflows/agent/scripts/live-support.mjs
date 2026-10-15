// workflows/agent/scripts/live-support.mjs
import { readFileSync } from "node:fs";
import { seal } from "@strickle/prover/sealed";
import { actionHash, requestAad } from "../enclave/signed.ts";
import { formatPlainDate, fromEpochDay } from "@strickle/core";
import { createPublicClient, getAddress, http, parseAbi, parseAbiItem } from "viem";
import { executeSponsored, networks, walletsClient } from "@strickle/arc";
import { decryptState, parseMaster, profileAad } from "../enclave/keys.ts";
import { decodeProfile, encodeProfile } from "../enclave/profile.ts";

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

export async function salaryOffset(ctx) {
  let lastDay = "";
  let lastPaid = "";
  const state = await readState(ctx);
  if (state.version > 0n) {
    const profile = decodeProfile(decryptState(parseMaster(process.env.AGENT_MASTER_VALUE), ctx.vault, state.version, state.ciphertext));
    lastDay = profile.tick.lastDay;
    lastPaid = profile.salary.lastPaid;
  }
  const epochDay = Math.floor(Date.now() / 86_400_000);
  for (let offset = 0; offset < 800; offset++) {
    const today = fromEpochDay(epochDay + offset);
    const text = formatPlainDate(today);
    if (today.day === 1 && text > lastDay && text.slice(0, 7) > lastPaid) return { offset, today };
  }
  throw new Error("no first of the month found");
}

export async function signAction(ctx, action, nonce, deadline) {
  const executor = ctx.contracts.AgentExecutor.address;
  const data = JSON.stringify({
    domain: { name: "Strickle Agent", version: "1", chainId: ctx.network.chain.id, verifyingContract: executor },
    types: {
      EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
      Action: [{ name: "vault", type: "address" }, { name: "actionHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
    },
    primaryType: "Action",
    message: { vault: ctx.vault, actionHash: actionHash(action), nonce: String(nonce), deadline: String(deadline) },
  });
  return (await ctx.circle.signTypedData({ walletId: ctx.walletId, data })).data.signature;
}

// What the app sends through the gateway: only the vault and an opaque blob sealed to the enclave's published key.
export async function sealRequest(ctx, request) {
  const key = await ctx.publicClient.readContract({ address: ctx.contracts.AgentState.address, abi: abi.state, functionName: "enclaveKey" });
  const sealed = seal(new TextEncoder().encode(JSON.stringify(request)), Buffer.from(key.slice(2), "hex"), requestAad(ctx.vault));
  return { vault: ctx.vault, sealed: `0x${Buffer.from(sealed).toString("hex")}` };
}

export async function readProfile(ctx) {
  const state = await readState(ctx);
  return decodeProfile(decryptState(parseMaster(process.env.AGENT_MASTER_VALUE), ctx.vault, state.version, state.ciphertext));
}
