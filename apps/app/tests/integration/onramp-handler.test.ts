import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { createLimiter } from "@strickle/db/limiter";
import { findOnrampSession } from "@strickle/db/onramp";
import { createInvoice, settlePayment } from "@strickle/db/payments";
import { createTestDatabase } from "@strickle/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onrampConfig } from "../../src/onramp/environment.ts";
import { type CardDeps, handleCardSession, handleCardStatus } from "../../src/server/onramp.ts";

const keys = invoiceKeys(randomBytes(32).toString("base64"));
const VAULT = `0x${"ab".repeat(20)}`;
const config = onrampConfig({ ONRAMP_API_KEY: "TEST_API_KEY:a:b", ONRAMP_REFERRER_DOMAIN: "app.strickle.xyz" }, "testnet");
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let asked: Parameters<CardDeps["mint"]>[0][];
let deps: (over?: Partial<CardDeps>) => CardDeps;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  asked = [];
  deps = (over = {}) => ({
    env: { RELAY_IP_PEPPER: "p".repeat(32) }, sql: db.sql, keys, limiter: createLimiter(db.sql), network: "testnet", chainId: 5042002, usdc: "0x3600000000000000000000000000000000000000",
    chain: { receipt: async () => null, blockTime: async () => new Date(), head: async () => 1n, transfersTo: async () => [] },
    onramp: config,
    mint: async (params) => (asked.push(params), { sessionId: `circle-${asked.length}`, sessionToken: "tok", widgetUrl: "https://onramp-sandbox.arc.io/?t=tok", expiresAt: new Date(Date.now() + 1_800_000).toISOString(), destinationWallet: params.destinationAddress }),
    ...over,
  });
});
afterAll(async () => db.drop());

const post = (ip: string, headers: Record<string, string> = {}) => new Request("http://localhost:3200/api/pay/x/card", { method: "POST", headers: { origin: "http://localhost:3200", "x-forwarded-for": ip, ...headers } });
const invoice = (over: { amount?: bigint; expiresAt?: Date | null } = {}) => createInvoice(db.sql, keys, { vault: VAULT, label: "L", payeeName: "P", note: "", amount: over.amount ?? 100_000_000n, expiresAt: over.expiresAt === undefined ? null : over.expiresAt });

describe("minting a card session for a link", () => {
  it("asks Circle for a session to the link's vault on the app's chain, bound to one of our rows", async () => {
    const created = await invoice();
    const result = await handleCardSession(post("10.1.0.1"), created.token, deps());
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ status: "session", session: { sessionId: expect.stringMatching(/^circle-/), widgetUrl: expect.stringContaining("onramp-sandbox.arc.io") } });
    const call = asked.at(-1);
    expect(call).toMatchObject({ destinationAddress: getAddress(VAULT), destinationChain: "Arc_Testnet", assets: { pairs: [{ token: "USDC", chain: "Arc_Testnet" }] } });
    expect(call?.amount).toBeUndefined();
    const row = await findOnrampSession(db.sql, { id: call?.appUserId });
    expect(row).toMatchObject({ vault: VAULT, status: "minted", circleSessionId: expect.stringMatching(/^circle-/) });
  });

  it("never returns the API key or our row id", async () => {
    const created = await invoice();
    const body = JSON.stringify((await handleCardSession(post("10.1.0.2"), created.token, deps())).body);
    expect(body).not.toContain("TEST_API_KEY");
    expect(body).not.toContain(asked.at(-1)?.appUserId as string);
  });

  it("is unavailable when card payments are not configured, and for an unknown link", async () => {
    const created = await invoice();
    expect((await handleCardSession(post("10.1.0.3"), created.token, deps({ onramp: null }))).body).toEqual({ status: "unavailable" });
    expect((await handleCardSession(post("10.1.0.4"), "nope", deps())).status).toBe(404);
  });

  it("refuses a paid, void or expired invoice", async () => {
    const paid = await invoice({ amount: 20_000n });
    const [{ memo_id }] = await db.sql<{ memo_id: string }[]>`select memo_id from payment_links where invoice_id = ${paid.id}`;
    await settlePayment(db.sql, { chainId: 5042002, txHash: `0x${"44".repeat(32)}`, logIndex: 1, vault: VAULT, payer: VAULT, amount: 20_000n, rail: "direct", memoId: memo_id, at: new Date() });
    expect((await handleCardSession(post("10.1.0.5"), paid.token, deps())).body).toEqual({ status: "closed" });
    const lapsed = await invoice({ expiresAt: new Date(Date.now() - 1000) });
    expect((await handleCardSession(post("10.1.0.6"), lapsed.token, deps())).body).toEqual({ status: "closed" });
  });

  it("requires the same origin", async () => {
    const created = await invoice();
    expect((await handleCardSession(post("10.1.0.7", { origin: "https://evil.example" }), created.token, deps())).status).toBe(400);
    expect((await handleCardSession(new Request("http://localhost:3200/api/pay/x/card", { method: "POST" }), created.token, deps())).status).toBe(400);
  });

  it("limits mints per payer and per link", async () => {
    const created = await invoice();
    const perIp: number[] = [];
    for (let i = 0; i < 7; i++) perIp.push((await handleCardSession(post("10.1.1.1"), created.token, deps())).status);
    expect(perIp).toContain(429);
    const perLink: number[] = [];
    for (let i = 0; i < 12; i++) perLink.push((await handleCardSession(post(`10.2.0.${i}`), created.token, deps())).status);
    expect(perLink).toContain(429);
  });

  it("turns a Circle failure into 'unavailable' and leaves no half-made session behind", async () => {
    const created = await invoice();
    const before = (await db.sql`select count(*) from onramp_sessions where status = 'minted'`)[0]?.count;
    const result = await handleCardSession(post("10.1.2.1"), created.token, deps({ mint: async () => Promise.reject(new Error("circle down")) }));
    expect(result).toEqual({ status: 502, body: { status: "unavailable" } });
    expect((await db.sql`select count(*) from onramp_sessions where status = 'minted'`)[0]?.count).toBe(before);
  });
});

describe("reading a card session's state", () => {
  it("answers only for a session minted for that link", async () => {
    const mine = await invoice();
    const other = await invoice();
    await handleCardSession(post("10.1.3.1"), mine.token, deps());
    const sessionId = `circle-${asked.length}`;
    const get = (ip: string) => new Request("http://localhost:3200/api/pay/x/card/s", { headers: { "x-forwarded-for": ip } });
    expect((await handleCardStatus(get("10.1.3.2"), mine.token, sessionId, deps())).body).toEqual({ status: "ok", state: "minted" });
    expect((await handleCardStatus(get("10.1.3.3"), other.token, sessionId, deps())).status).toBe(404);
    expect((await handleCardStatus(get("10.1.3.4"), mine.token, "circle-unknown", deps())).status).toBe(404);
  });
});
