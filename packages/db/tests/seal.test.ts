import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, parseKey, seal } from "../src/seal.ts";

const key = randomBytes(32);
const context = "agent_state:user-1:1";
const plain = Buffer.from("sentinel-424242424242");

describe("seal and open", () => {
  it("round-trips", () => {
    expect(open(key, seal(key, plain, context), context).equals(plain)).toBe(true);
  });

  it("does not contain the plaintext", () => {
    expect(seal(key, plain, context).includes(plain)).toBe(false);
  });

  it("never repeats a ciphertext for the same plaintext", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => seal(key, plain, context).toString("hex")));
    expect(seen.size).toBe(2000);
  });

  it("fails with another key", () => {
    expect(() => open(randomBytes(32), seal(key, plain, context), context)).toThrow();
  });

  it("fails when the context differs, so a value cannot be moved to another row", () => {
    expect(() => open(key, seal(key, plain, context), "agent_state:user-2:1")).toThrow();
  });

  it("fails when any single byte is modified", () => {
    const sealed = seal(key, plain, context);
    for (let i = 0; i < sealed.length; i++) {
      const tampered = Buffer.from(sealed);
      tampered[i] = (tampered[i] ?? 0) ^ 1;
      expect(() => open(key, tampered, context), `byte ${i}`).toThrow();
    }
  });

  it("rejects blobs that are too short or carry an unknown version", () => {
    expect(() => open(key, Buffer.alloc(28), context)).toThrow(/too short/);
    const unknown = Buffer.from(seal(key, plain, context));
    unknown[0] = 2;
    expect(() => open(key, unknown, context)).toThrow(/version/);
  });

  it("seals the empty value", () => {
    expect(open(key, seal(key, Buffer.alloc(0), context), context).length).toBe(0);
  });
});

describe("parseKey", () => {
  it("accepts 32 bytes in base64", () => {
    expect(parseKey(randomBytes(32).toString("base64")).length).toBe(32);
  });

  it.each([randomBytes(16).toString("base64"), randomBytes(33).toString("base64"), ""])("rejects %j", (text) => {
    expect(() => parseKey(text)).toThrow(/32 bytes/);
  });
});
