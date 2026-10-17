import { createSign, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { attachCircleSession, createOnrampSessionRow, findOnrampSession } from "@strickle/db/onramp";
import { createInvoice, getLinkByToken } from "@strickle/db/payments";
import { createTestDatabase } from "@strickle/db/testing";
import { networks } from "@strickle/arc/networks";
import { readMemoPayments } from "@strickle/arc/memo";
import { createLimiter } from "@strickle/db/limiter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type WebhookDeps, handleCircleWebhook, parseOnrampSettled } from "../../src/server/circle-webhook.ts";
import type { ChainReader } from "../../src/server/reconcile.ts";

const receipt = JSON.parse(readFileSync(new URL("../../../../packages/arc/tests/fixtures/memo/payment.json", import.meta.url), "utf8"));
const settledFixture = JSON.parse(readFileSync(new URL("../fixtures/onramp/settled.json", import.meta.url), "utf8"));
const USDC = networks.testnet.usdc;
const [real] = readMemoPayments(receipt, USDC);
if (!real) throw new Error("the fixture holds no payment");
const keys = invoiceKeys(randomBytes(32).toString("base64"));
const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const lookup = async () => pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const reader = (over: Partial<ChainReader> = {}): ChainReader => ({
  receipt: async (hash) => (hash === receipt.hash ? { status: "success", logs: receipt.logs, blockNumber: 100n } : null),
  blockTime: async () => new Date(), head: async () => 150n, transfersTo: async () => [], ...over,
});
// Every session below is credited by the same one real transaction, whose (chain, transaction, log) key is unique, so every test gets a database of its own.
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterEach(async () => db.drop());
const deps = (chain = reader()): WebhookDeps => ({ env: { RELAY_IP_PEPPER: "p".repeat(32) }, sql: db.sql, limiter: createLimiter(db.sql), keys, lookup, chain, chainId: 5042002, usdc: USDC, network: "testnet" });

async function session(over: { amount?: bigint } = {}) {
  const created = await createInvoice(db.sql, keys, { vault: real.vault, label: "L", payeeName: "P", note: "", amount: over.amount ?? real.amount * 2n, expiresAt: null });
  const view = (await getLinkByToken(db.sql, keys, created.token))!;
  const id = await createOnrampSessionRow(db.sql, { linkId: view.linkId, vault: real.vault, expiresAt: new Date(Date.now() + 1_800_000) });
  const circleSessionId = `circle-${id}`;
  await attachCircleSession(db.sql, id, circleSessionId);
  return { created, id, circleSessionId };
}
const notification = (s: { id: string; circleSessionId: string }, over: Record<string, unknown> = {}, nid = `n-${randomBytes(6).toString("hex")}`) => ({
  notificationType: "onramp.deposit.settled",
  notification: { ...settledFixture.notification, id: nid, sessionId: s.circleSessionId, userId: s.id, destinationAddress: real.vault, transactionHash: receipt.hash, ...over },
});
const request = (payload: unknown, signed = true, headers: Record<string, string> = {}) => {
  const body = JSON.stringify(payload);
  return new Request("http://localhost:3200/api/webhooks/circle", { method: "POST", headers: { "content-type": "application/json", "x-circle-key-id": "key-1", ...(signed ? { "x-circle-signature": createSign("SHA256").update(body).sign(pair.privateKey).toString("base64") } : {}), ...headers }, body });
};

describe("parseOnrampSettled", () => {
  it("reads the provisional fixture and fails closed on a payload it cannot map", () => {
    expect(parseOnrampSettled(settledFixture).ok).toBe(true);
    expect(parseOnrampSettled({ notificationType: "onramp.deposit.settled", notification: {} }).ok).toBe(false);
    expect(parseOnrampSettled({ notificationType: "onramp.deposit.settled", notification: { id: "n", destinationAddress: "nope" } }).ok).toBe(false);
    expect(parseOnrampSettled("garbage").ok).toBe(false);
  });
});

describe("the signature gate", () => {
  it("answers 403 and stores nothing for a missing, wrong or foreign signature", async () => {
    const s = await session();
    const payload = notification(s);
    expect((await handleCircleWebhook(request(payload, false), deps())).status).toBe(400); // no signature header at all
    expect((await handleCircleWebhook(request(payload, true, { "x-circle-signature": "AAAA" }), deps())).status).toBe(403);
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const body = JSON.stringify(payload);
    const forged = new Request("http://localhost:3200/api/webhooks/circle", { method: "POST", headers: { "x-circle-key-id": "key-1", "x-circle-signature": createSign("SHA256").update(body).sign(other.privateKey).toString("base64") }, body });
    expect((await handleCircleWebhook(forged, deps())).status).toBe(403);
    expect(Number((await db.sql`select count(*) from circle_webhook_events where notification_id = ${payload.notification.id}`)[0]?.count)).toBe(0);
    expect((await findOnrampSession(db.sql, { id: s.id }))?.status).toBe("minted");
  });

  it("answers 503, not 403, when Circle's key cannot be fetched: an honest delivery must be retried, not refused", async () => {
    const s = await session();
    const down: WebhookDeps = { ...deps(), lookup: async () => Promise.reject(new Error("circle down")) };
    expect((await handleCircleWebhook(request(notification(s)), down)).status).toBe(503);
  });

  it("limits unsigned traffic per IP and refuses a body beyond the cap", async () => {
    const statuses = [];
    for (let i = 0; i < 130; i++) statuses.push((await handleCircleWebhook(new Request("http://localhost:3200/api/webhooks/circle", { method: "POST", headers: { "x-forwarded-for": "10.2.0.1", "x-circle-key-id": `k${i}`, "x-circle-signature": "AAAA" }, body: "{}" }), deps())).status);
    expect(statuses).toContain(429);
    const big = new Request("http://localhost:3200/api/webhooks/circle", { method: "POST", headers: { "x-forwarded-for": "10.2.0.2", "x-circle-key-id": "key-1", "x-circle-signature": "AAAA" }, body: "x".repeat(70_000) });
    expect((await handleCircleWebhook(big, deps())).status).toBe(413);
  });

  it("acknowledges Circle's endpoint test without doing anything", async () => {
    const result = await handleCircleWebhook(request({ notificationType: "webhooks.test", notification: {} }), deps());
    expect(result.status).toBe(200);
  });
});

describe("an interrupted delivery", () => {
  it("is applied by the retry once the first attempt's claim has gone stale, and not while it may still be running", async () => {
    const s = await session();
    const payload = notification(s, {}, "n-crash");
    await db.sql`insert into circle_webhook_events (notification_id, type, payload) values ('n-crash', 'onramp.deposit.settled', ${db.sql.json(payload as never)})`; // a first attempt that died after claiming
    expect((await handleCircleWebhook(request(payload), deps())).status).toBe(503); // too soon to know it died
    await db.sql`update circle_webhook_events set received_at = now() - interval '5 minutes' where notification_id = 'n-crash'`;
    expect((await handleCircleWebhook(request(payload), deps())).body).toMatchObject({ applied: "credited" });
    expect((await handleCircleWebhook(request(payload), deps())).body).toMatchObject({ duplicate: true });
  });

  it("settles the session when the payment was already credited by an attempt that died before it", async () => {
    const s = await session();
    expect((await handleCircleWebhook(request(notification(s, {}, "n-first")), deps())).body).toMatchObject({ applied: "credited" });
    await db.sql`update onramp_sessions set status = 'minted', settled_tx = null where id = ${s.id}`; // the first attempt died before settling the session
    expect((await handleCircleWebhook(request(notification(s, {}, "n-second")), deps())).body).toMatchObject({ applied: "duplicate" });
    expect((await findOnrampSession(db.sql, { id: s.id }))?.status).toBe("settled");
  });

  it("marks the session unresolved when a notification for it cannot be applied", async () => {
    const s = await session();
    const reverted = reader({ receipt: async () => ({ status: "reverted", logs: receipt.logs, blockNumber: 100n }) });
    await handleCircleWebhook(request(notification(s)), deps(reverted));
    expect((await findOnrampSession(db.sql, { id: s.id }))?.status).toBe("unresolved");
  });
});

describe("a settled deposit", () => {
  it("credits what the chain shows, ignores what the notification claims, and settles the session", async () => {
    const s = await session();
    const lying = notification(s, { amount: "999999", tokenSymbol: "EURC" });
    const result = await handleCircleWebhook(request(lying), deps());
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ received: true, applied: "credited" });
    const [row] = await db.sql<{ amount: string; rail: string; state: string }[]>`select amount, rail, state from payments where tx_hash = ${receipt.hash.toLowerCase()} and invoice_id = ${s.created.id}`;
    expect(row).toMatchObject({ amount: String(real.amount), rail: "onramp", state: "credited" });
    expect(await findOnrampSession(db.sql, { id: s.id })).toMatchObject({ status: "settled", settledTx: receipt.hash.toLowerCase() });
  });

  it("shows partial when the card payment is short of the invoice", async () => {
    const s = await session({ amount: real.amount * 2n });
    await handleCircleWebhook(request(notification(s)), deps());
    const [invoice] = await db.sql<{ status: string; paid: string }[]>`select status, paid from invoices where id = ${s.created.id}`;
    expect(invoice).toMatchObject({ status: "partial", paid: String(real.amount) });
  });

  it("credits once however many times Circle delivers it", async () => {
    const s = await session();
    const payload = notification(s, {}, "n-fixed-1");
    expect((await handleCircleWebhook(request(payload), deps())).body).toMatchObject({ applied: "credited" });
    expect((await handleCircleWebhook(request(payload), deps())).body).toMatchObject({ duplicate: true });
    const again = notification(s, {}, "n-fixed-2"); // a different notification for the same transaction
    expect((await handleCircleWebhook(request(again), deps())).body).toMatchObject({ applied: "duplicate" });
    const [invoice] = await db.sql<{ paid: string }[]>`select paid from invoices where id = ${s.created.id}`;
    expect(invoice?.paid).toBe(String(real.amount));
  });

  it("treats a transaction the node does not know yet as transient, never as final: the event is released and Circle retries", async () => {
    const s = await session();
    const payload = notification(s, { transactionHash: `0x${"ab".repeat(32)}` }, "n-lag");
    expect((await handleCircleWebhook(request(payload), deps())).status).toBe(500);
    expect(Number((await db.sql`select count(*) from circle_webhook_events where notification_id = 'n-lag'`)[0]?.count)).toBe(0);
    expect(Number((await db.sql`select count(*) from payments`)[0]?.count)).toBe(0);
  });

  it("credits nothing when the transaction reverted or does not credit that vault", async () => {
    const s = await session();
    const reverted = reader({ receipt: async () => ({ status: "reverted", logs: receipt.logs, blockNumber: 100n }) });
    expect((await handleCircleWebhook(request(notification(s)), deps(reverted))).body).toMatchObject({ applied: "unresolved" });
    const elsewhere = await session();
    await db.sql`update onramp_sessions set vault = ${`0x${"99".repeat(20)}`} where id = ${elsewhere.id}`;
    expect((await handleCircleWebhook(request(notification(elsewhere)), deps())).body).toMatchObject({ applied: "unresolved" });
    expect(Number((await db.sql`select count(*) from payments where invoice_id = ${s.created.id}`)[0]?.count)).toBe(0);
  });

  it("leaves a notification for an unknown session stored and acknowledged, never credited", async () => {
    const payload = notification({ id: "11111111-1111-4111-8111-111111111111", circleSessionId: "circle-unknown" });
    const result = await handleCircleWebhook(request(payload), deps());
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ applied: "unresolved" });
    expect(Number((await db.sql`select count(*) from circle_webhook_events where notification_id = ${payload.notification.id}`)[0]?.count)).toBe(1);
  });

  it("releases the event and answers 500 when the chain cannot be read, so Circle retries", async () => {
    const s = await session();
    const payload = notification(s, {}, "n-retry");
    const down = reader({ receipt: async () => Promise.reject(new Error("rpc down")) });
    expect((await handleCircleWebhook(request(payload), deps(down))).status).toBe(500);
    expect(Number((await db.sql`select count(*) from circle_webhook_events where notification_id = 'n-retry'`)[0]?.count)).toBe(0);
    expect((await handleCircleWebhook(request(payload), deps())).body).toMatchObject({ applied: "credited" });
  });
});
