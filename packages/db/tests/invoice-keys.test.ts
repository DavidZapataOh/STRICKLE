import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { invoiceKeys, linkToken, tokenHash } from "../src/invoice-keys.ts";

const secret = randomBytes(32).toString("base64");
const ID = "11111111-1111-4111-8111-111111111111";

describe("invoice keys", () => {
  it("derives three different keys from one secret, deterministically", () => {
    const a = invoiceKeys(secret);
    const b = invoiceKeys(secret);
    expect(a.seal.equals(b.seal)).toBe(true);
    expect(new Set([a.seal.toString("hex"), a.link.toString("hex"), a.session.toString("hex")]).size).toBe(3);
    expect(invoiceKeys(randomBytes(32).toString("base64")).seal.equals(a.seal)).toBe(false);
  });

  it("refuses a secret that is not 32 bytes", () => {
    expect(() => invoiceKeys(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => invoiceKeys("")).toThrow();
  });

  it("makes a link token that is stable per invoice and version, URL-safe and 128 bits", () => {
    const keys = invoiceKeys(secret);
    const token = linkToken(keys, ID, 1);
    expect(token).toBe(linkToken(keys, ID, 1));
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(linkToken(keys, ID, 2)).not.toBe(token);
    expect(linkToken(keys, "22222222-2222-4222-8222-222222222222", 1)).not.toBe(token);
  });

  it("hashes a token for lookup without the secret", () => {
    expect(tokenHash("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash("abc")).not.toBe(tokenHash("abd"));
  });
});
