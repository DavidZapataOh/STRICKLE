import { type Action, type SignedRequest, actionHash, requestAad } from "@strickle/agent/signed";
import type { TypedDataRequest } from "@strickle/arc/passkey";
import { seal } from "@strickle/prover/sealed";
import { type Address, type Hex, bytesToHex, hexToBytes } from "viem";

// The enclave refuses a deadline more than 600 seconds ahead of its own clock.
export const DEADLINE_SECONDS = 540;
const MAX_SKEW_MS = 120_000;

export interface Signer {
  signTypedData(typed: TypedDataRequest): Promise<Hex>;
}

export function typedDataFor(input: { executor: Address; chainId: number; vault: Address; action: Action; nonce: bigint; deadline: number }): TypedDataRequest {
  return {
    domain: { name: "Strickle Agent", version: "1", chainId: input.chainId, verifyingContract: input.executor },
    types: { Action: [{ name: "vault", type: "address" }, { name: "actionHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
    primaryType: "Action",
    message: { vault: input.vault, actionHash: actionHash(input.action), nonce: input.nonce, deadline: BigInt(input.deadline) },
  };
}

// The app cannot read the stored nonce (the state is encrypted), so the nonce is the time in milliseconds: strictly increasing
// as long as the clock is sane. A clock that disagrees with the chain by more than two minutes is not trusted, and the nonce
// never goes below the last one this device sent for the vault.
export function nextNonce(chainSeconds: number, clockMs: number, last: bigint | null): bigint {
  const chainMs = chainSeconds * 1000;
  const base = BigInt(Math.abs(clockMs - chainMs) > MAX_SKEW_MS ? chainMs : clockMs);
  return last !== null && base <= last ? last + 1n : base;
}

export async function signAction(args: { signer: Signer; vault: Address; action: Action; executor: Address; chainId: number; chainSeconds: number; clockMs: number; lastNonce: bigint | null }): Promise<SignedRequest> {
  const nonce = nextNonce(args.chainSeconds, args.clockMs, args.lastNonce);
  const deadline = args.chainSeconds + DEADLINE_SECONDS;
  const signature = await args.signer.signTypedData(typedDataFor({ executor: args.executor, chainId: args.chainId, vault: args.vault, action: args.action, nonce, deadline }));
  return { vault: args.vault, action: args.action, nonce: nonce.toString(), deadline, signature };
}

export function sealRequest(args: { request: SignedRequest; enclaveKey: Hex }): { vault: Address; sealed: Hex } {
  const key = hexToBytes(args.enclaveKey);
  if (key.length !== 32) throw new Error("the enclave key must be 32 bytes");
  const sealed = seal(new TextEncoder().encode(JSON.stringify(args.request)), key, requestAad(args.request.vault as Address));
  return { vault: args.request.vault as Address, sealed: bytesToHex(sealed) };
}
