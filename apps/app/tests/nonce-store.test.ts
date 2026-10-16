import { describe, expect, it } from "vitest";
import { createNonceStore } from "../src/agent/nonce-store.ts";

const vault = "0x00000000000000000000000000000000000000a1" as const;
const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
};

describe("createNonceStore", () => {
  it("remembers the highest nonce per vault and never lowers it", () => {
    const store = createNonceStore(memory());
    expect(store.last(vault)).toBeNull();
    store.remember(vault, 10n);
    store.remember(vault, 5n);
    expect(store.last(vault)).toBe(10n);
    expect(store.last("0x00000000000000000000000000000000000000b2")).toBeNull();
  });

  it("treats corrupt or unavailable storage as no history instead of throwing", () => {
    const corrupt = createNonceStore({ getItem: () => "not a number", setItem: () => undefined });
    expect(corrupt.last(vault)).toBeNull();
    const broken = createNonceStore({ getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } });
    expect(broken.last(vault)).toBeNull();
    expect(() => broken.remember(vault, 1n)).not.toThrow();
  });
});
