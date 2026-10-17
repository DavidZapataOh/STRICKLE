import { createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { readMemoPayments } from "@strickle/arc/memo";
import { networks } from "@strickle/arc/networks";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { createLimiter } from "@strickle/db/limiter";
import { createInvoice } from "@strickle/db/payments";
import { createTestDatabase } from "@strickle/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onrampConfig } from "../../src/onramp/environment.ts";
import { handleCircleWebhook } from "../../src/server/circle-webhook.ts";
import { type CardDeps, handleCardSession, handleCardStatus } from "../../src/server/onramp.ts";
import { handlePayView } from "../../src/server/pay.ts";
import type { ChainReader } from "../../src/server/reconcile.ts";

const receipt = JSON.parse(readFileSync(new URL("../../../../packages/arc/tests/fixtures/memo/payment.json", import.meta.url), "utf8"));
const USDC = networks.testnet.usdc;
const [real] = readMemoPayments(receipt, USDC);
if (!real) throw new Error("the fixture holds no payment");
const keys = invoiceKeys(randomBytes(32).toString("base64"));
const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const chain: ChainReader = { receipt: async (hash) => (hash === receipt.hash ? { status: "success", logs: receipt.logs, blockNumber: 100n } : null), blockTime: async () => new Date(), head: async () => 150n, transfersTo: async () => [] };
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let deps: CardDeps;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  deps = {
    env: { RELAY_IP_PEPPER: "p".repeat(32) }, sql: db.sql, keys, limiter: createLimiter(db.sql), network: "testnet", chainId: 5042002, usdc: USDC, chain,
    onramp: onrampConfig({ ONRAMP_API_KEY: "TEST_API_KEY:a:b", ONRAMP_REFERRER_DOMAIN: "app.strickle.xyz" }, "testnet"),
    mint: async (params) => ({ sessionId: "circle-flow-1", sessionToken: "tok", widgetUrl: "https://onramp-sandbox.arc.io/?t=tok", expiresAt: new Date(Date.now() + 1_800_000).toISOString(), destinationWallet: params.destinationAddress }),
  };
});
afterAll(async () => db.drop());

describe("a card payment from the link to the invoice", () => {
  it("mints, is settled by a signed notification the chain confirms, shows partial, and a repeat changes nothing", async () => {
    const created = await createInvoice(db.sql, keys, { vault: real.vault, label: "Card", payeeName: "Ana", note: "", amount: real.amount * 2n, expiresAt: null });
    const post = (path: string, ip: string) => new Request(`http://localhost:3200${path}`, { method: "POST", headers: { origin: "http://localhost:3200", "x-forwarded-for": ip } });
    const minted = await handleCardSession(post("/api/pay/x/card", "10.9.0.1"), created.token, deps);
    expect(minted.status).toBe(201);
    const [row] = await db.sql<{ id: string }[]>`select id from onramp_sessions where circle_session_id = 'circle-flow-1'`;

    const body = JSON.stringify({ notificationType: "onramp.deposit.settled", notification: { id: "flow-n-1", sessionId: "circle-flow-1", userId: row?.id, destinationAddress: real.vault, transactionHash: receipt.hash } });
    const signed = () => new Request("http://localhost:3200/api/webhooks/circle", { method: "POST", headers: { "x-circle-key-id": "key-1", "x-circle-signature": createSign("SHA256").update(body).sign(pair.privateKey).toString("base64") }, body });
    const webhook = { ...deps, lookup: async () => pair.publicKey.export({ type: "spki", format: "der" }).toString("base64") };
    expect((await handleCircleWebhook(signed(), webhook)).body).toMatchObject({ applied: "credited" });

    const get = (ip: string) => new Request("http://localhost:3200/api/pay/x", { headers: { "x-forwarded-for": ip } });
    expect((await handlePayView(get("10.9.0.2"), created.token, deps)).body).toMatchObject({ status: "ok", invoice: { status: "partial", paid: String(real.amount) } });
    expect((await handleCardStatus(get("10.9.0.3"), created.token, "circle-flow-1", deps)).body).toEqual({ status: "ok", state: "settled" });

    expect((await handleCircleWebhook(signed(), webhook)).body).toMatchObject({ duplicate: true });
    expect((await handlePayView(get("10.9.0.4"), created.token, deps)).body).toMatchObject({ invoice: { paid: String(real.amount) } });
  });
});
