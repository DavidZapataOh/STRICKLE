import { createPublicKey, createVerify } from "node:crypto";

export type PublicKeyLookup = (keyId: string) => Promise<string>;

const KEY_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function verifyCircleSignature(input: { body: string; signature: string; keyId: string; lookup: PublicKeyLookup }): Promise<boolean> {
  if (!KEY_ID.test(input.keyId) || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.signature)) return false;
  try {
    const key = createPublicKey({ key: Buffer.from(await input.lookup(input.keyId), "base64"), format: "der", type: "spki" });
    return createVerify("SHA256").update(input.body).verify(key, Buffer.from(input.signature, "base64"));
  } catch {
    return false;
  }
}

export function circlePublicKeyLookup(config: { apiBaseUrl: string; apiKey: string; fetcher?: typeof fetch; ttlMs?: number; failureMs?: number; now?: () => number }): PublicKeyLookup {
  const { fetcher = fetch, ttlMs = 3_600_000, failureMs = 60_000, now = Date.now } = config;
  const cache = new Map<string, { key: string | null; at: number }>();
  const remember = (keyId: string, key: string | null) => {
    if (cache.size >= 64) cache.delete(cache.keys().next().value as string); // an attacker's key ids must not grow memory without bound
    cache.set(keyId, { key, at: now() });
  };
  return async (keyId) => {
    if (!KEY_ID.test(keyId)) throw new Error("not a key id");
    const hit = cache.get(keyId);
    if (hit && now() - hit.at < (hit.key === null ? failureMs : ttlMs)) {
      if (hit.key === null) throw new Error("Circle has no such notification key");
      return hit.key;
    }
    try {
      const response = await fetcher(`${config.apiBaseUrl}/v2/notifications/publicKey/${keyId}`, { headers: { Accept: "application/json", Authorization: `Bearer ${config.apiKey}` } });
      if (!response.ok) throw new Error(`Circle answered ${response.status} for the notification key`);
      const key = ((await response.json()) as { data?: { publicKey?: string } }).data?.publicKey;
      if (!key) throw new Error("Circle returned no notification key");
      remember(keyId, key);
      return key;
    } catch (error) {
      remember(keyId, null);
      throw error;
    }
  };
}
