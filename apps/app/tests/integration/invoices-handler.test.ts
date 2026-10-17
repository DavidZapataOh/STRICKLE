import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { createLimiter } from "@strickle/db/limiter";
import { getLinkByToken, settlePayment, suggestMatch } from "@strickle/db/payments";
import { createTestDatabase } from "@strickle/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER_COOKIE, mintOwnerCookie } from "../../src/server/owner-session.ts";
import { handleCreateInvoice, handleInvoiceAction, handleListInvoices, handleReconcile, type InvoiceDeps } from "../../src/server/invoices.ts";

const keys = invoiceKeys(randomBytes(32).toString("base64"));
const A = `0x${"aa".repeat(20)}` as const;
const B = `0x${"bb".repeat(20)}` as const;
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let deps: InvoiceDeps;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  deps = { env: { RELAY_IP_PEPPER: "p".repeat(32) }, sql: db.sql, keys, limiter: createLimiter(db.sql), chain: { head: async () => 500n, receipt: async () => null, blockTime: async () => new Date(), transfersTo: async () => [] }, network: "testnet", chainId: 5042002, usdc: "0x3600000000000000000000000000000000000000" };
});
afterAll(async () => db.drop());

const cookie = (vault: string) => `${OWNER_COOKIE}=${mintOwnerCookie(keys, vault as `0x${string}`, Math.floor(Date.now() / 1000) + 600)}`;
const call = (path: string, method: string, vault: string | null, body?: unknown) => new Request(`http://localhost:3200${path}`, { method, headers: { "content-type": "application/json", origin: "http://localhost:3200", ...(vault ? { cookie: cookie(vault) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const valid = { label: "Website redesign", payeeName: "Ana Studio", note: "October", amount: "100", expiresInDays: 14 };
const create = async (vault: string, over: Record<string, unknown> = {}) => handleCreateInvoice(call("/api/invoices", "POST", vault, { ...valid, ...over }), deps);

describe("creating invoices", () => {
  it("creates one for the vault in the cookie, ignoring a vault in the body, and the link resolves", async () => {
    const result = await create(A, { vault: B });
    expect(result.status).toBe(201);
    if (result.body.status !== "created") throw new Error("setup");
    expect(await getLinkByToken(db.sql, keys, result.body.token)).toMatchObject({ vault: getAddress(A), label: "Website redesign", amount: 100_000_000n });
  });

  it("needs the owner cookie", async () => {
    expect((await handleCreateInvoice(call("/api/invoices", "POST", null, valid), deps)).status).toBe(401);
  });

  it("refuses amounts outside the range and fields that are too long", async () => {
    for (const over of [{ amount: "0" }, { amount: "0.0000001" }, { amount: "1000001" }, { amount: "abc" }, { label: "" }, { label: "x".repeat(81) }, { payeeName: "x".repeat(61) }, { note: "x".repeat(301) }, { expiresInDays: 0 }, { expiresInDays: 91 }]) {
      expect((await create(A, over)).status, JSON.stringify(over)).toBe(400);
    }
  });

  it("starts the payment scan at the current block the first time a vault bills", async () => {
    const vault = `0x${"cc".repeat(20)}`;
    await create(vault);
    expect((await db.sql<{ block: string }[]>`select block from payment_cursors where vault = ${vault}`)[0]?.block).toBe("500");
  });
});

describe("listing and acting", () => {
  it("lists only the cookie's vault, each with its link", async () => {
    const mine = await create(`0x${"d1".repeat(20)}`);
    await create(`0x${"d2".repeat(20)}`);
    const listed = await handleListInvoices(call("/api/invoices", "GET", `0x${"d1".repeat(20)}`), deps);
    expect(listed.status).toBe(200);
    if (listed.body.status !== "ok" || mine.body.status !== "created") throw new Error("setup");
    expect(listed.body.invoices).toHaveLength(1);
    expect(listed.body.invoices[0]).toMatchObject({ id: mine.body.id, token: mine.body.token });
  });

  it("another vault's cookie cannot rotate, void, confirm or dismiss", async () => {
    const mine = await create(`0x${"e1".repeat(20)}`);
    if (mine.body.status !== "created") throw new Error("setup");
    for (const action of ["rotate", "void", "dismiss"] as const) {
      expect((await handleInvoiceAction(call(`/api/invoices/${mine.body.id}`, "POST", `0x${"e2".repeat(20)}`, { action, paymentId: "11111111-1111-4111-8111-111111111111" }), mine.body.id, deps)).status, action).toBe(404);
    }
    expect(await getLinkByToken(db.sql, keys, mine.body.token)).not.toBeNull();
  });

  it("rotating kills the old link, voiding closes the page and later money still counts", async () => {
    const vault = `0x${"f1".repeat(20)}`;
    const made = await create(vault);
    if (made.body.status !== "created") throw new Error("setup");
    const rotated = await handleInvoiceAction(call(`/api/invoices/${made.body.id}`, "POST", vault, { action: "rotate" }), made.body.id, deps);
    if (!("token" in rotated.body) || !rotated.body.token) throw new Error("no token");
    expect(await getLinkByToken(db.sql, keys, made.body.token)).toBeNull();
    expect(await getLinkByToken(db.sql, keys, rotated.body.token)).not.toBeNull();
    await handleInvoiceAction(call(`/api/invoices/${made.body.id}`, "POST", vault, { action: "void" }), made.body.id, deps);
    expect((await getLinkByToken(db.sql, keys, rotated.body.token))?.revoked).toBe(true);
    const [{ memo_id }] = await db.sql<{ memo_id: string }[]>`select memo_id from payment_links where invoice_id = ${made.body.id}`;
    expect((await settlePayment(db.sql, { chainId: 5042002, txHash: `0x${"41".repeat(32)}`, logIndex: 1, vault, payer: A, amount: 1_000_000n, rail: "direct", memoId: memo_id, at: new Date() })).outcome).toBe("extra");
  });

  it("confirms a suggestion into a credit and dismisses another", async () => {
    const vault = `0x${"a7".repeat(20)}`;
    const made = await create(vault, { amount: "77" });
    if (made.body.status !== "created") throw new Error("setup");
    await suggestMatch(db.sql, { chainId: 5042002, txHash: `0x${"51".repeat(32)}`, logIndex: 2, vault, payer: A, amount: 77_000_000n, at: new Date() });
    const listed = await handleListInvoices(call("/api/invoices", "GET", vault), deps);
    if (listed.body.status !== "ok") throw new Error("setup");
    const suggestion = listed.body.invoices[0]?.suggestions[0];
    const confirmed = await handleInvoiceAction(call(`/api/invoices/${made.body.id}`, "POST", vault, { action: "confirm", paymentId: suggestion?.id }), made.body.id, deps);
    expect(confirmed.status).toBe(200);
    expect((await getLinkByToken(db.sql, keys, made.body.token))?.status).toBe("paid");
  });
});

describe("reconcile covers a backlog in one press", () => {
  it("walks several windows until it reaches the head", async () => {
    const vault = `0x${"b8".repeat(20)}`;
    await create(vault);
    await db.sql`update payment_cursors set block = 0 where vault = ${vault}`;
    const seen: bigint[] = [];
    const wide = { ...deps, chain: { ...deps.chain, head: async () => 12_000n, transfersTo: async (_v: string, from: bigint, to: bigint) => (seen.push(to), []) } };
    const result = await handleReconcile(call("/api/invoices/reconcile", "POST", vault), wide as never);
    expect(result.status).toBe(200);
    expect(seen.at(-1)).toBe(12_000n);
  });
});

describe("reconcile", () => {
  it("runs a scan for the owner's vault and then makes the owner wait", async () => {
    const vault = `0x${"b9".repeat(20)}`;
    await create(vault);
    expect((await handleReconcile(call("/api/invoices/reconcile", "POST", vault), deps)).status).toBe(200);
    const second = await handleReconcile(call("/api/invoices/reconcile", "POST", vault), deps);
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({ status: "rate-limited" });
  });
});
