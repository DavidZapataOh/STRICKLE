import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { circlePublicKeyLookup, verifyCircleSignature } from "../src/server/circle-signature.ts";

const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
const spki = (key: typeof pair.publicKey) => key.export({ type: "spki", format: "der" }).toString("base64");
const sign = (body: string, key = pair.privateKey) => createSign("SHA256").update(body).sign(key).toString("base64");
const lookup = async (keyId: string) => (keyId === "key-1" ? spki(pair.publicKey) : keyId === "key-2" ? spki(other.publicKey) : Promise.reject(new Error("unknown key")));
const body = JSON.stringify({ notificationType: "onramp.deposit.settled", notification: { id: "n-1" } });

describe("verifyCircleSignature", () => {
  it("accepts the exact body signed by the key it names", async () => {
    expect(await verifyCircleSignature({ body, signature: sign(body), keyId: "key-1", lookup })).toBe(true);
  });

  it("rejects a changed body, a signature by another key and a different key id", async () => {
    expect(await verifyCircleSignature({ body: `${body} `, signature: sign(body), keyId: "key-1", lookup })).toBe(false);
    expect(await verifyCircleSignature({ body, signature: sign(body, other.privateKey), keyId: "key-1", lookup })).toBe(false);
    expect(await verifyCircleSignature({ body, signature: sign(body), keyId: "key-2", lookup })).toBe(false);
  });

  it("rejects garbage without throwing", async () => {
    for (const signature of ["", "not base64!!", "AAAA", sign(body).slice(0, 20)]) {
      expect(await verifyCircleSignature({ body, signature, keyId: "key-1", lookup })).toBe(false);
    }
    expect(await verifyCircleSignature({ body, signature: sign(body), keyId: "nobody", lookup })).toBe(false);
    expect(await verifyCircleSignature({ body, signature: sign(body), keyId: "", lookup })).toBe(false);
  });
});

describe("circlePublicKeyLookup", () => {
  const reply = (publicKey: string) => async () => new Response(JSON.stringify({ data: { publicKey } }), { status: 200 });

  it("asks Circle once per key and caches the answer for a while", async () => {
    let calls = 0;
    let clock = 0;
    const find = circlePublicKeyLookup({ apiBaseUrl: "https://api-test.circle.com", apiKey: "TEST_API_KEY:a:b", ttlMs: 1000, now: () => clock, fetcher: async (url, init) => {
      calls++;
      expect(String(url)).toBe("https://api-test.circle.com/v2/notifications/publicKey/key-1");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer TEST_API_KEY:a:b");
      return reply(spki(pair.publicKey))();
    } });
    expect(await find("key-1")).toBe(spki(pair.publicKey));
    expect(await find("key-1")).toBe(spki(pair.publicKey));
    expect(calls).toBe(1);
    clock = 1500;
    await find("key-1");
    expect(calls).toBe(2);
  });

  it("remembers a failure for a minute, so a stranger's key ids cost one call each, then asks again; and refuses a key id that is not a plain identifier", async () => {
    let calls = 0;
    let clock = 0;
    const find = circlePublicKeyLookup({ apiBaseUrl: "https://api-test.circle.com", apiKey: "k", now: () => clock, fetcher: async () => (calls++, new Response("no", { status: 500 })) });
    await expect(find("key-1")).rejects.toThrow();
    await expect(find("key-1")).rejects.toThrow();
    expect(calls).toBe(1);
    clock = 61_000;
    await expect(find("key-1")).rejects.toThrow();
    expect(calls).toBe(2);
    await expect(find("../../etc")).rejects.toThrow(/key id/);
    expect(calls).toBe(2);
  });
});
