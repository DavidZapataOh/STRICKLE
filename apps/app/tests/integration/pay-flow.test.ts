import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { readMemoPayments } from "@strickle/arc/memo";
import { networks } from "@strickle/arc/networks";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { createLimiter } from "@strickle/db/limiter";
import { createTestDatabase } from "@strickle/db/testing";
import { createPublicClient, http } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleCreateInvoice, handleInvoiceAction, handleListInvoices, handleReconcile } from "../../src/server/invoices.ts";
import { OWNER_COOKIE, mintOwnerCookie } from "../../src/server/owner-session.ts";
import { chainReader } from "../../src/server/payment-deps.ts";
import { handlePayClaim, handlePayView, type PayDeps } from "../../src/server/pay.ts";

const receipt = JSON.parse(readFileSync(new URL("../../../../packages/arc/tests/fixtures/memo/payment.json", import.meta.url), "utf8"));
const network = networks.testnet;
const [real] = readMemoPayments(receipt, network.usdc);
if (!real) throw new Error("the fixture holds no payment");
const keys = invoiceKeys(randomBytes(32).toString("base64"));
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let deps: PayDeps;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  // the chain is read for real: the transaction below is a real payment on Arc testnet
  const client = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
  deps = { env: { RELAY_IP_PEPPER: "p".repeat(32) }, sql: db.sql, keys, limiter: createLimiter(db.sql), chain: chainReader(client as never, network.usdc), network: "testnet", chainId: network.chain.id, usdc: network.usdc };
});
afterAll(async () => db.drop());

const owner = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost:3200${path}`, { method, headers: { "content-type": "application/json", origin: "http://localhost:3200", "x-forwarded-for": "10.2.0.1", cookie: `${OWNER_COOKIE}=${mintOwnerCookie(keys, real.vault, Math.floor(Date.now() / 1000) + 600)}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

describe("the whole server path with a real payment", () => {
  it("creates, shows, credits from a reported transaction, scans, and rotates", async () => {
    const created = await handleCreateInvoice(owner("/api/invoices", "POST", { label: "Real", payeeName: "Ana", note: "", amount: "0.01", expiresInDays: 7 }), deps);
    if (created.body.status !== "created") throw new Error(`not created: ${created.body.status}`);
    await db.sql`update payment_links set memo_id = ${real.memoId.toLowerCase()} where invoice_id = ${created.body.id}`;
    await db.sql`update invoices set amount = ${real.amount.toString()} where id = ${created.body.id}`;

    const shown = await handlePayView(new Request("http://localhost:3200/api/pay/x", { headers: { "x-forwarded-for": "10.2.0.2" } }), created.body.token, deps);
    expect(shown.body).toMatchObject({ status: "ok", invoice: { label: "Real", closed: false } });

    const claim = await handlePayClaim(new Request("http://localhost:3200/api/pay/x/claim", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3200", "x-forwarded-for": "10.2.0.3" }, body: JSON.stringify({ txHash: receipt.hash }) }), created.body.token, deps);
    expect(claim.body).toEqual({ status: "claimed", result: "credited" });

    const listed = await handleListInvoices(owner("/api/invoices", "GET"), deps);
    if (listed.body.status !== "ok") throw new Error("list failed");
    expect(listed.body.invoices[0]).toMatchObject({ status: "paid", suggestions: [] });

    const scan = await handleReconcile(owner("/api/invoices/reconcile", "POST"), deps);
    expect(scan.status).toBe(200);
    const after = await handleListInvoices(owner("/api/invoices", "GET"), deps);
    if (after.body.status !== "ok") throw new Error("list failed");
    expect(after.body.invoices[0]?.suggestions).toEqual([]);

    const rotated = await handleInvoiceAction(owner(`/api/invoices/${created.body.id}`, "POST", { action: "rotate" }), created.body.id, deps);
    expect(rotated.status).toBe(200);
    const old = await handlePayView(new Request("http://localhost:3200/api/pay/x", { headers: { "x-forwarded-for": "10.2.0.4" } }), created.body.token, deps);
    expect(old.status).toBe(404);
  }, 60_000);
});
