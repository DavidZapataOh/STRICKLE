import { type PlainDate, plainDate } from "@strickle/core";
import { type Address, type Hex, bytesToHex, getAddress, zeroAddress } from "viem";
import { saveSession } from "../account/session.ts";
import { swapSetupCalls } from "../boxes/currency.ts";
import { agentStateAbi, factoryAbi } from "../chain/abi.ts";
import { getPublicClient } from "../chain/client.ts";
import { factoryCanSwap } from "../chain/vault.ts";
import { agentDeploymentsFor, appNetwork, deploymentsFor, networkInfo } from "../config/network.ts";
import { type NoticeKey, saveNoticeKey } from "../keys/notice-key.ts";
import { isPasskeyCancelled } from "../wallet/errors.ts";
import { type PasskeyWallet, connectWallet } from "../wallet/passkey.ts";
import { usd } from "./answers.ts";
import { onboardingCalls } from "./calls.ts";
import type { Diagnosis } from "./diagnosis.ts";
import { buildProfile, sealProfile } from "./profile.ts";
import type { Ready } from "./types.ts";

export type CreateStep = "passkey" | "sign" | "agent";

export interface Connected {
  wallet: PasskeyWallet;
  owner: Address;
  /** The owner's vault: the one that exists, or the address the factory will give a new one. */
  vault: Address;
  existing: boolean;
  username: string;
}

export interface Outcome {
  owner: Address;
  vault: Address;
  txHash: Hex | null;
  existing: boolean;
}

export function classifyError(error: unknown): "unsupported" | "cancelled" | "failed" {
  if (error instanceof Error && error.message === "passkeys are not supported here") return "unsupported";
  if (isPasskeyCancelled(error)) return "cancelled";
  return "failed";
}

const today = (): PlainDate => {
  const now = new Date();
  return plainDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
};

/** Registers a passkey, or signs in with one, and finds out whether its owner already has a vault. Nothing is written to the chain here. */
export async function connectAccount(args: { mode: "register" | "login"; username: string }): Promise<Connected> {
  const wallet = await connectWallet(args.mode, args.username);
  const owner = getAddress(wallet.address);
  const chain = getPublicClient();
  const { BoxVaultFactory } = deploymentsFor();
  const existing = getAddress(await chain.readContract({ address: BoxVaultFactory, abi: factoryAbi, functionName: "vaultOf", args: [owner] }));
  if (existing !== zeroAddress) return { wallet, owner, vault: existing, existing: true, username: args.username };
  if (args.mode === "login") throw new Error("no account");
  const vault = getAddress(await chain.readContract({ address: BoxVaultFactory, abi: factoryAbi, functionName: "predict", args: [owner] }));
  return { wallet, owner, vault, existing: false, username: args.username };
}

/**
 * Opens the boxes in one sponsored operation. It can be run again with the same connection after a failure: the notice key is already kept under
 * the vault's address, a vault that the first attempt did create is recognised, and no second passkey is made.
 */
export async function finishCreate(args: { connected: Connected; answers: Ready; diagnosis: Diagnosis; userKey: NoticeKey; onStep: (step: CreateStep) => void }): Promise<Outcome> {
  const { wallet, owner, vault, username } = args.connected;
  const chain = getPublicClient();
  const deployed = { ...deploymentsFor(), ...agentDeploymentsFor() };

  // The key is kept before the transaction, under the vault the transaction creates: if it lands and the reply is lost, the user can still read their notices.
  await saveNoticeKey(vault, args.userKey.secret);

  const created = getAddress(await chain.readContract({ address: deployed.BoxVaultFactory, abi: factoryAbi, functionName: "vaultOf", args: [owner] }));
  if (created !== zeroAddress) {
    saveSession({ owner, vault: created, username, createdAt: Math.floor(Date.now() / 1000) });
    return { owner, vault: created, txHash: null, existing: true };
  }

  const enclaveKey = await chain.readContract({ address: deployed.AgentState, abi: agentStateAbi, functionName: "enclaveKey" });
  if (/^0x0+$/.test(enclaveKey)) throw new Error("the agent has no key yet");

  args.onStep("sign");
  const profile = buildProfile({ answers: args.answers, diagnosis: args.diagnosis, owner, today: today(), userKey: bytesToHex(args.userKey.publicKey) });
  const sealed = sealProfile({ profile, vault, enclaveKey });
  // a new vault starts the adapter's one-day wait at creation, so conversions can begin a day after the account exists; an implementation without swaps is left alone
  const swapCalls = (await factoryCanSwap(deployed.BoxVaultFactory, chain)) ? swapSetupCalls(vault, networkInfo(appNetwork()).swapAdapter) : [];
  const txHash = await wallet.sendCalls(
    onboardingCalls({ factory: deployed.BoxVaultFactory, executor: deployed.AgentExecutor, state: deployed.AgentState, vault, owner, capUnits: usd(args.answers.salaryGoalUsd), sealed, vaultExists: false, swapCalls }),
  );
  args.onStep("agent");
  saveSession({ owner, vault, username, createdAt: Math.floor(Date.now() / 1000) });
  return { owner, vault, txHash, existing: false };
}

/** Polls the agent's state until the enclave has applied the profile, for up to ten minutes. */
export async function watchAgent(vault: Address, signal: AbortSignal): Promise<"ready" | "waiting"> {
  const chain = getPublicClient();
  const { AgentState } = agentDeploymentsFor();
  for (let waited = 0; waited < 600 && !signal.aborted; waited += 10) {
    const [, , applied] = await chain.readContract({ address: AgentState, abi: agentStateAbi, functionName: "head", args: [vault] });
    if (applied >= 1n) return "ready";
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  return "waiting";
}
