import { generateProverKey } from "@strickle/prover/sealed";
import { type Address, getAddress } from "viem";
import { noticePublicKey } from "./recovery-code.ts";
import { type SecretStore, wrappedSecretStore } from "./secret-store.ts";

export interface NoticeKey {
  secret: bigint;
  publicKey: Uint8Array;
}

const nameOf = (vault: Address) => `notice-key:${getAddress(vault).toLowerCase()}`;
const toHex = (secret: bigint) => secret.toString(16).padStart(64, "0");

export const generateNoticeKey = (): NoticeKey => generateProverKey();

export function noticeKeyFromSecret(secret: bigint): NoticeKey | undefined {
  const publicKey = noticePublicKey(secret);
  return publicKey ? { secret, publicKey } : undefined;
}

export const saveNoticeKey = (vault: Address, secret: bigint, store: SecretStore = wrappedSecretStore): Promise<void> => store.set(nameOf(vault), toHex(secret));

export async function loadNoticeKey(vault: Address, store: SecretStore = wrappedSecretStore): Promise<NoticeKey | null> {
  const stored = await store.get(nameOf(vault));
  if (!stored || !/^[0-9a-f]{64}$/.test(stored)) return null;
  return noticeKeyFromSecret(BigInt(`0x${stored}`)) ?? null;
}

export const forgetNoticeKey = (vault: Address, store: SecretStore = wrappedSecretStore): Promise<void> => store.remove(nameOf(vault));
