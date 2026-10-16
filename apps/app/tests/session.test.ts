import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { SESSION_KEY, clearSession, loadSession, saveSession } from "../src/account/session.ts";

const owner = getAddress("0x00000000000000000000000000000000000000b2");
const vault = getAddress("0x00000000000000000000000000000000000000a1");
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key), data };
};

describe("the session record", () => {
  it("round-trips with checksummed addresses under one versioned key", () => {
    const storage = memory();
    saveSession({ owner: owner.toLowerCase() as `0x${string}`, vault: vault.toLowerCase() as `0x${string}`, username: "maria laptop", createdAt: 1_800_000_000 }, storage);
    expect(storage.data.has(SESSION_KEY)).toBe(true);
    expect(loadSession(storage)).toEqual({ owner, vault, username: "maria laptop", createdAt: 1_800_000_000 });
  });

  it("is null for nothing, garbage, another shape or a bad address", () => {
    const storage = memory();
    expect(loadSession(storage)).toBeNull();
    for (const bad of ["not json", "{}", JSON.stringify({ owner: "0x1", vault, username: "", createdAt: 1 }), JSON.stringify({ owner, vault, username: "x".repeat(65), createdAt: 1 }), JSON.stringify({ owner, vault, username: "", createdAt: 1, extra: 1 })]) {
      storage.setItem(SESSION_KEY, bad);
      expect(loadSession(storage)).toBeNull();
    }
  });

  it("allows a session whose passkey name was never captured", () => {
    const storage = memory();
    saveSession({ owner, vault, username: "", createdAt: 1 }, storage);
    expect(loadSession(storage)?.username).toBe("");
  });

  it("clears, and survives a storage that throws or does not exist", () => {
    const storage = memory();
    saveSession({ owner, vault, username: "", createdAt: 1 }, storage);
    clearSession(storage);
    expect(loadSession(storage)).toBeNull();
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(() => saveSession({ owner, vault, username: "", createdAt: 1 }, broken)).not.toThrow();
    expect(loadSession(broken)).toBeNull();
    expect(loadSession(null)).toBeNull();
  });
});
