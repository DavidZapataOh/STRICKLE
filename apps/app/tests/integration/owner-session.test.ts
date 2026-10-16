import { createTestDatabase } from "@strickle/db/testing";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { createLimiter } from "@strickle/db/limiter";
import { randomBytes } from "node:crypto";
import { recoverAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER_COOKIE, handleOwnerSession, mintOwnerCookie, ownerTypedData, readOwnerCookie, requireOwner } from "../../src/server/owner-session.ts";

const keys = invoiceKeys(randomBytes(32).toString("base64"));
const owner = privateKeyToAccount(generatePrivateKey());
const VAULT = `0x${"ab".repeat(20)}` as const;
const UNREGISTERED = `0x${"ee".repeat(20)}`;
const OTHER_VAULT = `0x${"cd".repeat(20)}` as const;
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterAll(async () => db.drop());

const chain = {
  registered: async (vault: string) => vault.toLowerCase() !== UNREGISTERED,
  ownerOf: async (vault: string) => (vault.toLowerCase() === VAULT ? owner.address : privateKeyToAccount(generatePrivateKey()).address),
  accepts: async (signer: `0x${string}`, digest: `0x${string}`, signature: `0x${string}`) => (await recoverAddress({ hash: digest, signature })) === signer,
};
const deps = () => ({ env: { RELAY_IP_PEPPER: "p".repeat(32) }, keys, sql: db.sql, limiter: createLimiter(db.sql), chain, network: "testnet" as const });
const sign = async (vault = VAULT, nonce = 7n, deadline = Math.floor(Date.now() / 1000) + 120) => {
  const typed = ownerTypedData({ chainId: 5042002, vault, nonce, deadline });
  return { vault, nonce: nonce.toString(), deadline, signature: await owner.signTypedData(typed as never) };
};
let ipCounter = 0;
const post = (body: unknown, origin = "http://localhost:3200") => new Request("http://localhost:3200/api/owner-session", { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": `10.20.0.${++ipCounter}` }, body: JSON.stringify(body) });

describe("the owner session", () => {
  it("starts from a valid signature of the vault's owner and gives a cookie for that vault", async () => {
    const result = await handleOwnerSession(post(await sign(VAULT, 11n)), deps());
    expect(result.status).toBe(200);
    expect(result.cookie?.maxAge).toBe(1800);
    expect(result.cookie?.header).toBe(`${OWNER_COOKIE}=${result.cookie?.value}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=1800`);
    const request = new Request("http://localhost:3200/api/invoices", { headers: { cookie: `${OWNER_COOKIE}=${result.cookie?.value}` } });
    expect(requireOwner(request, keys)).toBe(VAULT);
  });

  it("refuses a replay of the same signature", async () => {
    const body = await sign(VAULT, 12n);
    expect((await handleOwnerSession(post(body), deps())).status).toBe(200);
    expect((await handleOwnerSession(post(body), deps())).status).toBe(401);
  });

  it("refuses the same signature again with the nonce written differently", async () => {
    const body = await sign(VAULT, 18n);
    expect((await handleOwnerSession(post(body), deps())).status).toBe(200);
    expect((await handleOwnerSession(post({ ...body, nonce: `000${body.nonce}` }), deps())).status).toBe(401);
  });

  it("refuses a contract that is not a registered vault, even when its owner signs", async () => {
    const chainForFake = { ...chain, ownerOf: async () => owner.address };
    const fake = await sign(UNREGISTERED as `0x${string}`, 19n);
    expect((await handleOwnerSession(post(fake), { ...deps(), chain: chainForFake })).status).toBe(401);
  });

  it("refuses an expired deadline and one too far in the future", async () => {
    expect((await handleOwnerSession(post(await sign(VAULT, 13n, Math.floor(Date.now() / 1000) - 5)), deps())).status).toBe(401);
    expect((await handleOwnerSession(post(await sign(VAULT, 14n, Math.floor(Date.now() / 1000) + 3600)), deps())).status).toBe(401);
  });

  it("refuses a signature by someone who does not own the vault, and one made for another vault", async () => {
    const stranger = privateKeyToAccount(generatePrivateKey());
    const typed = ownerTypedData({ chainId: 5042002, vault: VAULT, nonce: 15n, deadline: Math.floor(Date.now() / 1000) + 120 });
    const forged = { vault: VAULT, nonce: "15", deadline: Number(typed.message.deadline), signature: await stranger.signTypedData(typed as never) };
    expect((await handleOwnerSession(post(forged), deps())).status).toBe(401);
    const other = await sign(OTHER_VAULT, 16n);
    expect((await handleOwnerSession(post(other), deps())).status).toBe(401);
  });

  it("limits attempts per IP", async () => {
    const statuses = [];
    for (let i = 0; i < 14; i++) statuses.push((await handleOwnerSession(new Request("http://localhost:3200/api/owner-session", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3200", "x-forwarded-for": "10.3.0.1" }, body: JSON.stringify({ vault: "nope" }) }), deps())).status);
    expect(statuses).toContain(429);
  });

  it("requires the same origin and a well-formed body", async () => {
    expect((await handleOwnerSession(post(await sign(VAULT, 17n), "https://evil.example"), deps())).status).toBe(400);
    expect((await handleOwnerSession(post({ vault: "nope" }), deps())).status).toBe(400);
  });
});

describe("the owner cookie", () => {
  it("is bound to one vault and expires", () => {
    const value = mintOwnerCookie(keys, VAULT, 2_000);
    expect(readOwnerCookie(keys, value, 1_000)).toEqual({ vault: VAULT, expiresAt: 2_000 });
    expect(readOwnerCookie(keys, value, 2_001)).toBeUndefined();
    expect(readOwnerCookie(keys, value.replace(VAULT.slice(2), OTHER_VAULT.slice(2)), 1_000)).toBeUndefined();
    expect(readOwnerCookie(keys, `${value}x`, 1_000)).toBeUndefined();
    expect(readOwnerCookie(invoiceKeys(randomBytes(32).toString("base64")), value, 1_000)).toBeUndefined();
  });

  it("is refused on an unsafe method from another origin", () => {
    const value = mintOwnerCookie(keys, VAULT, Math.floor(Date.now() / 1000) + 600);
    const cross = new Request("http://localhost:3200/api/invoices", { method: "POST", headers: { cookie: `${OWNER_COOKIE}=${value}`, origin: "https://evil.example" } });
    expect(requireOwner(cross, keys)).toBeUndefined();
    const same = new Request("http://localhost:3200/api/invoices", { method: "POST", headers: { cookie: `${OWNER_COOKIE}=${value}`, origin: "http://localhost:3200" } });
    expect(requireOwner(same, keys)).toBe(VAULT);
  });
});
