import { createPublicKey, createVerify } from "node:crypto";

export type PublicKeyLookup = (keyId: string) => Promise<string>;

const KEY_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** "unavailable" is not a forgery: Circle's key endpoint could not be reached, and the delivery must be retried rather than refused. */
export async function checkCircleSignature(input: { body: string; signature: string; keyId: string; lookup: PublicKeyLookup }): Promise<"valid" | "invalid" | "unavailable"> {
  if (!KEY_ID.test(input.keyId) || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.signature)) return "invalid";
  let der: string;
  try {
    der = await input.lookup(input.keyId);
  } catch {
    return "unavailable";
  }
  try {
    const key = createPublicKey({ key: Buffer.from(der, "base64"), format: "der", type: "spki" });
    return createVerify("SHA256").update(input.body).verify(key, Buffer.from(input.signature, "base64")) ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}

export async function verifyCircleSignature(input: { body: string; signature: string; keyId: string; lookup: PublicKeyLookup }): Promise<boolean> {
  return (await checkCircleSignature(input)) === "valid";
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

const shared = new Map<string, PublicKeyLookup>();

/** One lookup, and so one key cache, per Circle account for the life of the server process: a lookup built per request would ask Circle on every request, forged ones included. */
export function sharedPublicKeyLookup(config: Parameters<typeof circlePublicKeyLookup>[0]): PublicKeyLookup {
  const id = `${config.apiBaseUrl}|${config.apiKey}`;
  let lookup = shared.get(id);
  if (!lookup) {
    lookup = circlePublicKeyLookup(config);
    shared.set(id, lookup);
  }
  return lookup;
}
