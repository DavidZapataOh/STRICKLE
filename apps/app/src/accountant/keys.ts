import { ORDER, type ViewKey, generateViewKey, viewKeyFromSecret } from "@strickle/pool/crypto/keys";
import { type Hex, bytesToHex } from "viem";
import type { SecretStore } from "../keys/secret-store.ts";

import { ACCOUNTANT_KEY } from "./storage-name.ts";

export { ACCOUNTANT_KEY };

export const newAccountantKey = (): ViewKey => generateViewKey();
export const publicKeyHex = (key: ViewKey): Hex => bytesToHex(key.publicKey);
export const secretHex = (key: ViewKey): string => key.secret.toString(16).padStart(64, "0");

export function parseSecretHex(text: string): ViewKey | null {
  const trimmed = text.trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) return null;
  const secret = BigInt(`0x${trimmed}`);
  return secret >= 1n && secret < ORDER ? viewKeyFromSecret(secret) : null;
}

export async function saveAccountantKey(store: SecretStore, key: ViewKey): Promise<void> {
  await store.set(ACCOUNTANT_KEY, JSON.stringify({ secret: secretHex(key), publicKey: publicKeyHex(key) }));
}

export async function loadAccountantKey(store: SecretStore): Promise<ViewKey | null> {
  try {
    const stored = JSON.parse((await store.get(ACCOUNTANT_KEY)) ?? "null") as { secret?: unknown; publicKey?: unknown } | null;
    if (!stored || typeof stored.secret !== "string" || typeof stored.publicKey !== "string") return null;
    const key = parseSecretHex(stored.secret);
    return key && publicKeyHex(key) === stored.publicKey ? key : null;
  } catch {
    return null;
  }
}

export const clearAccountantKey = (store: SecretStore): Promise<void> => store.remove(ACCOUNTANT_KEY);
