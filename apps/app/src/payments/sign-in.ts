import type { PasskeyWallet } from "@strickle/arc/passkey";
import type { Address, Hex } from "viem";
import { ownerTypedData } from "../server/owner-session.ts";

const DEADLINE_SECONDS = 240;

/** One passkey signature that proves the vault's owner is at the keyboard; the server answers it with a short cookie. */
export async function signOwnerSession(wallet: Pick<PasskeyWallet, "signTypedData">, input: { chainId: number; vault: Address }): Promise<{ vault: Address; nonce: string; deadline: number; signature: Hex }> {
  const random = crypto.getRandomValues(new Uint8Array(16));
  const nonce = BigInt(`0x${Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;
  const signature = await wallet.signTypedData(ownerTypedData({ chainId: input.chainId, vault: input.vault, nonce, deadline }));
  return { vault: input.vault, nonce: nonce.toString(), deadline, signature };
}
