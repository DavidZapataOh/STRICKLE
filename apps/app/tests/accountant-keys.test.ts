import { ORDER, generateViewKey } from "@strickle/pool/crypto/keys";
import { describe, expect, it } from "vitest";
import { clearAccountantKey, loadAccountantKey, newAccountantKey, parseSecretHex, publicKeyHex, saveAccountantKey, secretHex } from "../src/accountant/keys.ts";

const memory = () => {
  const map = new Map<string, string>();
  return { get: async (name: string) => map.get(name) ?? null, set: async (name: string, value: string) => void map.set(name, value), remove: async (name: string) => void map.delete(name) };
};

describe("the accountant's view key", () => {
  it("round-trips through the device's secret store and comes back whole", async () => {
    const store = memory();
    const key = newAccountantKey();
    await saveAccountantKey(store, key);
    const loaded = await loadAccountantKey(store);
    expect(loaded?.secret).toBe(key.secret);
    expect(loaded && publicKeyHex(loaded)).toBe(publicKeyHex(key));
  });

  it("returns null for a missing, garbled or mismatched key and forgets on request", async () => {
    const store = memory();
    expect(await loadAccountantKey(store)).toBeNull();
    await store.set("strickle.accountant-key.v1", "not json");
    expect(await loadAccountantKey(store)).toBeNull();
    await store.set("strickle.accountant-key.v1", JSON.stringify({ secret: secretHex(newAccountantKey()), publicKey: publicKeyHex(generateViewKey()) }));
    expect(await loadAccountantKey(store)).toBeNull();
    await saveAccountantKey(store, newAccountantKey());
    await clearAccountantKey(store);
    expect(await loadAccountantKey(store)).toBeNull();
  });

  it("imports a secret from hex and refuses everything that is not one", () => {
    const key = newAccountantKey();
    expect(parseSecretHex(secretHex(key))?.secret).toBe(key.secret);
    expect(secretHex(key)).toMatch(/^[0-9a-f]{64}$/);
    for (const bad of ["", "12", "zz".repeat(32), "00".repeat(32), ORDER.toString(16).padStart(64, "0")]) expect(parseSecretHex(bad)).toBeNull();
  });
});
