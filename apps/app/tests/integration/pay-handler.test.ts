import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { createLimiter } from "@strickle/db/limiter";
import { createInvoice, getLinkByToken, rotateLink, settlePayment } from "@strickle/db/payments";
import { createTestDatabase } from "@strickle/db/testing";
import { networks } from "@strickle/arc/networks";
import { readMemoPayments } from "@strickle/arc/memo";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handlePayClaim, handlePayDeposit, handlePayView, type PayDeps } from "../../src/server/pay.ts";
import type { ChainReader } from "../../src/server/reconcile.ts";

const receipt = JSON.parse(readFileSync(new URL("../../../../packages/arc/tests/fixtures/memo/payment.json", import.meta.url), "utf8"));
const USDC = networks.testnet.usdc;
const [real] = readMemoPayments(receipt, USDC);
if (!real) throw new Error("the fixture holds no payment");
// the network boundaries plan-level handler tests state: Iris, the burn sender and the arrival check
const depositBoundary = { guard: { vault: async () => ({ registered: true, hasState: true, paused: false }) }, access: async () => "allow" as const, burn: async () => null, burnSender: async () => null, track: async () => ({ state: "waiting" as const }) };
const keys = invoiceKeys(randomBytes(32).toString("base64"));
const reader: ChainReader = {
  receipt: async (hash) => (hash === receipt.hash ? { status: "success", logs: receipt.logs, blockNumber: 100n } : null),
  blockTime: async () => new Date(),
  head: async () => 150n,
  transfersTo: async () => [],
};
// The one real transaction can credit only one invoice, so every test gets a database of its own.
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let deps: () => PayDeps;
let created: Awaited<ReturnType<typeof invoiceForRealPayment>>;
beforeEach(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  deps = () => ({ env: { RELAY_IP_PEPPER: "p".repeat(32) }, sql: db.sql, keys, limiter: createLimiter(db.sql), chain: reader, network: "testnet", chainId: 5042002, usdc: USDC });
  created = await invoiceForRealPayment();
});
afterEach(async () => db.drop());

const origin = { origin: "http://localhost:3200" };
const get = (headers: Record<string, string> = {}) => new Request("http://localhost:3200/api/pay/x", { headers });
const post = (body: unknown, headers: Record<string, string> = origin, raw?: string) => new Request("http://localhost:3200/api/pay/x/claim", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw ?? JSON.stringify(body) });
/** An invoice whose memo id is the one the real transaction carried, so the real receipt is a real payment of it. */
async function invoiceForRealPayment(over: { amount?: bigint; expiresAt?: Date | null } = {}) {
  const made = await createInvoice(db.sql, keys, { vault: real.vault, label: "Website redesign", payeeName: "Ana Studio", note: "October", amount: over.amount ?? real.amount, expiresAt: over.expiresAt === undefined ? new Date(Date.now() + 86_400_000) : over.expiresAt });
  // the memo id is unique: hand it from whichever invoice held it to this one
  await db.sql`update payment_links set memo_id = '0x' || md5(random()::text) || md5(random()::text) where memo_id = ${real.memoId.toLowerCase()}`;
  await db.sql`update payment_links set memo_id = ${real.memoId.toLowerCase()} where invoice_id = ${made.id}`;
  return made;
}

describe("GET /api/pay/[token]", () => {
  it("shows the invoice a client needs, and nothing else", async () => {
    const { status, body } = await handlePayView(get(), created.token, deps());
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", invoice: { label: "Website redesign", payeeName: "Ana Studio", amount: String(real.amount), remaining: String(real.amount), closed: false, expired: false, vault: real.vault } });
    expect(JSON.stringify(body)).not.toMatch(/payer|tokenHash|token_hash|sealed/);
  });

  it("answers one uniform 404 for an unknown, malformed or rotated token", async () => {
    const other = await invoiceForRealPayment();
    const answers = await Promise.all(["nope", "A".repeat(22), "", other.token.slice(0, 21)].map((token) => handlePayView(get({ "x-forwarded-for": "10.8.0.1" }), token, deps())));
    for (const answer of answers) expect(answer).toEqual({ status: 404, body: { status: "not-found" } });
    const rotated = await rotateLink(db.sql, keys, real.vault, other.id);
    expect((await handlePayView(get({ "x-forwarded-for": "10.8.0.2" }), other.token, deps())).status).toBe(404);
    expect((await handlePayView(get({ "x-forwarded-for": "10.8.0.2" }), rotated?.token as string, deps())).status).toBe(200);
  });

  it("marks a paid invoice closed and an expired one expired, and still answers", async () => {
    const paid = await invoiceForRealPayment({ amount: 20_000n });
    await settlePayment(db.sql, { chainId: 5042002, txHash: `0x${"31".repeat(32)}`, logIndex: 1, vault: real.vault, payer: real.payer, amount: 20_000n, rail: "direct", memoId: (await db.sql<{ memo_id: string }[]>`select memo_id from payment_links where invoice_id = ${paid.id}`)[0]?.memo_id, at: new Date() });
    const closed = await handlePayView(get({ "x-forwarded-for": "10.8.0.3" }), paid.token, deps());
    expect(closed.body).toMatchObject({ status: "ok", invoice: { closed: true, remaining: "0" } });
    const lapsed = await invoiceForRealPayment({ expiresAt: new Date(Date.now() - 1000) });
    const expired = await handlePayView(get({ "x-forwarded-for": "10.8.0.4" }), lapsed.token, deps());
    expect(expired.body).toMatchObject({ status: "ok", invoice: { expired: true, closed: false } });
  });

  it("limits lookups per IP and keeps another IP unaffected", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 70; i++) statuses.push((await handlePayView(get({ "x-forwarded-for": "10.9.0.1" }), created.token, deps())).status);
    expect(statuses).toContain(429);
    expect((await handlePayView(get({ "x-forwarded-for": "10.9.0.2" }), created.token, deps())).status).toBe(200); // there is no per-link counter a stranger could exhaust
  });
});

describe("POST /api/pay/[token]/claim", () => {
  it("credits the invoice from the real transaction and reports it, once", async () => {
    const ip = { ...origin, "x-forwarded-for": "10.7.0.1" };
    expect((await handlePayClaim(post({ txHash: receipt.hash }, ip), created.token, deps())).body).toEqual({ status: "claimed", result: "credited" });
    expect((await handlePayClaim(post({ txHash: receipt.hash }, ip), created.token, deps())).body).toEqual({ status: "claimed", result: "duplicate" });
  });

  it("requires the same origin, a transaction hash and a small body", async () => {
    const link = await invoiceForRealPayment();
    const ip = { "x-forwarded-for": "10.7.0.2" };
    expect((await handlePayClaim(post({ txHash: receipt.hash }, { ...ip, origin: "https://evil.example" }), link.token, deps())).status).toBe(400);
    expect((await handlePayClaim(post({ txHash: receipt.hash }, ip), link.token, deps())).status).toBe(400);
    expect((await handlePayClaim(post({ txHash: "0x12" }, { ...origin, ...ip }), link.token, deps())).status).toBe(400);
    expect((await handlePayClaim(post({}, { ...origin, ...ip }, JSON.stringify({ txHash: receipt.hash, pad: "x".repeat(5000) })), link.token, deps())).status).toBe(400);
  });

  it("says pending for a transaction the chain does not know yet and none for one that pays something else", async () => {
    const link = await invoiceForRealPayment();
    const ip = { ...origin, "x-forwarded-for": "10.7.0.3" };
    expect((await handlePayClaim(post({ txHash: `0x${"88".repeat(32)}` }, ip), link.token, deps())).body).toEqual({ status: "claimed", result: "pending" });
    await db.sql`update payment_links set memo_id = ${`0x${"01".repeat(32)}`} where invoice_id = ${link.id}`;
    expect((await handlePayClaim(post({ txHash: receipt.hash }, ip), link.token, deps())).body).toEqual({ status: "claimed", result: "none" });
  });

  it("limits how often one transaction hash is looked up, without stopping the honest retry of a pending payment", async () => {
    const hash = `0x${"5a".repeat(32)}`;
    const six = [];
    for (let i = 0; i < 6; i++) six.push((await handlePayClaim(post({ txHash: hash }, { ...origin, "x-forwarded-for": "10.6.0.1" }), created.token, deps())).status);
    expect(six).toEqual([200, 200, 200, 200, 200, 200]);
    expect((await handlePayClaim(post({ txHash: hash }, { ...origin, "x-forwarded-for": "10.6.0.1" }), created.token, deps())).status).toBe(429);
  });

  it("limits the claims that find nothing, per link, and never the confirmation of a payment already credited", async () => {
    const payer = { ...origin, "x-forwarded-for": "10.8.200.1" };
    expect((await handlePayClaim(post({ txHash: receipt.hash }, payer), created.token, deps())).body).toEqual({ status: "claimed", result: "credited" });
    const strangers = [];
    for (let i = 0; i < 205; i++) strangers.push((await handlePayClaim(post({ txHash: `0x${i.toString(16).padStart(64, "0")}` }, { ...origin, "x-forwarded-for": `10.8.${Math.floor(i / 25)}.${i % 25}` }), created.token, deps())).status);
    expect(strangers.filter((status) => status === 429).length).toBeGreaterThan(0); // the link's budget for claims that find nothing is spent
    await db.sql`delete from rate_counters where key like 'pay-claim-hash:%'`; // the per-hash counter is short-lived and separate
    const again = await handlePayClaim(post({ txHash: receipt.hash }, { ...origin, "x-forwarded-for": "10.8.201.1" }), created.token, deps());
    expect(again.body).toEqual({ status: "claimed", result: "duplicate" }); // already known: answered from the database, outside the budget
  });
});

describe("POST /api/pay/[token]/deposits", () => {
  const body = (over: Record<string, unknown> = {}) => ({ vault: `0x${"99".repeat(20)}`, sourceChain: "Base_Sepolia", sourceAddress: `0x${"34".repeat(20)}`, amount: "25000000", speed: "fast", feeMode: "source", intent: "own", inputToken: "USDC", ...over });
  const dep = (token: string, payload: unknown, ip: string) => handlePayDeposit(new Request(`http://localhost:3200/api/pay/${token}/deposits`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3200", "x-forwarded-for": ip }, body: JSON.stringify(payload) }), token, { ...deps(), ...depositBoundary }, { kind: "create" });

  it("creates a deposit bound to the link's vault whatever the body says, always as income", async () => {
    const link = await invoiceForRealPayment();
    const result = await dep(link.token, body(), "10.5.0.1");
    expect(result.status).toBe(201);
    const [row] = await db.sql<{ vault: string; intent: string; link_id: string | null }[]>`select vault, intent, link_id from deposit_intents order by created_at desc limit 1`;
    expect(row).toMatchObject({ vault: real.vault.toLowerCase(), intent: "income" });
    expect(row?.link_id).toBe((await getLinkByToken(db.sql, keys, link.token))?.linkId);
  });

  it("refuses a closed invoice and an unknown link", async () => {
    const paid = await invoiceForRealPayment({ amount: 20_000n });
    await db.sql`update invoices set status = 'paid', paid = amount where id = ${paid.id}`;
    expect((await dep(paid.token, body(), "10.5.0.2")).status).toBe(409);
    expect((await dep("nope", body(), "10.5.0.3")).status).toBe(404);
  });
});
