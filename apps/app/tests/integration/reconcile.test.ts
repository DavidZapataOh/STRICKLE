import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { createInvoice, getLinkByToken, listInvoices, setCursor } from "@strickle/db/payments";
import { createTestDatabase } from "@strickle/db/testing";
import { networks } from "@strickle/arc/networks";
import { readMemoPayments } from "@strickle/arc/memo";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ChainReader, claimPayment, scanVault } from "../../src/server/reconcile.ts";

const receipt = JSON.parse(readFileSync(new URL("../../../../packages/arc/tests/fixtures/memo/payment.json", import.meta.url), "utf8"));
const USDC = networks.testnet.usdc;
const [real] = readMemoPayments(receipt, USDC);
if (!real) throw new Error("the fixture holds no payment");
const keys = invoiceKeys(randomBytes(32).toString("base64"));
// The one real transaction can credit only one invoice (its memo id and its (chain, transaction, log) key are unique), so every test gets a database of its own.
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterEach(async () => db.drop());

const reader = (over: Partial<ChainReader> = {}): ChainReader => ({
  receipt: async (hash) => (hash === receipt.hash ? { status: "success", logs: receipt.logs, blockNumber: 100n } : null),
  blockTime: async () => new Date(),
  head: async () => 150n,
  transfersTo: async () => [],
  ...over,
});
const deps = (chain = reader()) => ({ sql: db.sql, keys, chain, chainId: 5042002, usdc: USDC });
/** An invoice whose memo id is the one the real transaction carried, so the real receipt is a real payment of it. */
async function invoiceForRealPayment(amount = real.amount) {
  const created = await createInvoice(db.sql, keys, { vault: real.vault, label: "L", payeeName: "P", note: "", amount, expiresAt: null });
  await db.sql`update payment_links set memo_id = ${real.memoId.toLowerCase()} where invoice_id = ${created.id}`;
  return created;
}

describe("claimPayment", () => {
  it("credits an invoice from a real Memo transaction the payer reports", async () => {
    const created = await invoiceForRealPayment();
    const link = await getLinkByToken(db.sql, keys, created.token);
    expect(await claimPayment(deps(), link!, receipt.hash)).toEqual({ result: "credited" });
    expect(await claimPayment(deps(), link!, receipt.hash)).toEqual({ result: "duplicate" });
  });

  it("says pending while the transaction is unknown, and none when it pays something else", async () => {
    const created = await invoiceForRealPayment();
    const link = await getLinkByToken(db.sql, keys, created.token);
    expect(await claimPayment(deps(), link!, `0x${"99".repeat(32)}`)).toEqual({ result: "pending" });
    const other = await createInvoice(db.sql, keys, { vault: real.vault, label: "L", payeeName: "P", note: "", amount: real.amount, expiresAt: null });
    const otherLink = await getLinkByToken(db.sql, keys, other.token);
    expect(await claimPayment(deps(), otherLink!, receipt.hash)).toEqual({ result: "none" });
  });

  it("does not credit a reverted transaction", async () => {
    const created = await invoiceForRealPayment();
    const link = await getLinkByToken(db.sql, keys, created.token);
    const chain = reader({ receipt: async () => ({ status: "reverted", logs: receipt.logs, blockNumber: 100n }) });
    expect(await claimPayment(deps(chain), link!, receipt.hash)).toEqual({ result: "none" });
  });
});

describe("scanVault", () => {
  it("settles a Memo payment the payer never reported", async () => {
    const created = await invoiceForRealPayment();
    const chain = reader({ transfersTo: async () => [{ txHash: receipt.hash, logIndex: real.transferLogIndex, payer: real.payer, amount: real.amount, blockNumber: 100n }] });
    const out = await scanVault(deps(chain), real.vault);
    expect(out.credited).toBeGreaterThanOrEqual(1);
    expect((await listInvoices(db.sql, keys, real.vault)).find((item) => item.id === created.id)?.status).toBe("paid");
  });

  it("suggests, without crediting, a memo-less transfer of the exact amount of an open invoice", async () => {
    const vault = `0x${"12".repeat(20)}` as const;
    const created = await createInvoice(db.sql, keys, { vault, label: "L", payeeName: "P", note: "", amount: 88_000_000n, expiresAt: null });
    const chain = reader({ transfersTo: async () => [{ txHash: `0x${"77".repeat(32)}`, logIndex: 3, payer: `0x${"34".repeat(20)}` as `0x${string}`, amount: 88_000_000n, blockNumber: 120n }], receipt: async () => ({ status: "success", logs: [], blockNumber: 120n }) });
    const out = await scanVault(deps(chain), vault);
    expect(out).toMatchObject({ credited: 0, suggested: 1 });
    expect((await listInvoices(db.sql, keys, vault)).find((item) => item.id === created.id)).toMatchObject({ paid: 0n, status: "open" });
  });

  it("starts at the first invoice's block, moves the cursor forward, and scans a bounded window per call", async () => {
    const vault = `0x${"56".repeat(20)}` as const;
    await createInvoice(db.sql, keys, { vault, label: "L", payeeName: "P", note: "", amount: 10_000_000n, expiresAt: null });
    await setCursor(db.sql, vault, 0n); // what the create-invoice route does the first time a vault bills (it sets the cursor to the head)
    const seen: [bigint, bigint][] = [];
    const chain = reader({ head: async () => 20_000n, transfersTo: async (_v, from, to) => (seen.push([from, to]), []) });
    const first = await scanVault({ ...deps(chain), maxBlocks: 5_000n }, vault);
    expect(first.scanned).toBe(5_000n);
    const second = await scanVault({ ...deps(chain), maxBlocks: 5_000n }, vault);
    expect(seen[1]?.[0]).toBe((seen[0]?.[1] ?? 0n) + 1n);
    expect(second.scanned).toBe(5_000n);
  });
});


describe("scan robustness", () => {
  it("ignores dust below the smallest invoice and reads each block time once", async () => {
    const vault = `0x${"78".repeat(20)}` as const;
    await createInvoice(db.sql, keys, { vault, label: "L", payeeName: "P", note: "", amount: 1_000_000n, expiresAt: null });
    await setCursor(db.sql, vault, 0n);
    let blockReads = 0;
    const transfers = Array.from({ length: 6 }, (_, i) => ({ txHash: `0x${(i + 1).toString(16).padStart(64, "0")}` as `0x${string}`, logIndex: 1, payer: `0x${"34".repeat(20)}` as `0x${string}`, amount: i < 4 ? 1n : 1_000_000n, blockNumber: 100n }));
    const chain = reader({ transfersTo: async () => transfers, blockTime: async () => (blockReads++, new Date()), receipt: async () => ({ status: "success", logs: [], blockNumber: 100n }) });
    const out = await scanVault(deps(chain), vault);
    expect(out.suggested).toBe(2);
    expect((await db.sql`select 1 from payments where vault = ${vault.toLowerCase()}`).length).toBe(2);
    expect(blockReads).toBeLessThanOrEqual(1);
  });

  it("credits a bridged payment bound to a link from its forward transaction, even when the page never saw it arrive", async () => {
    const vault = `0x${"79".repeat(20)}` as const;
    const created = await createInvoice(db.sql, keys, { vault, label: "L", payeeName: "P", note: "", amount: 50_000_000n, expiresAt: null });
    const link = await getLinkByToken(db.sql, keys, created.token);
    const forwardTx = `0x${"c1".repeat(32)}` as `0x${string}`;
    await db.sql`insert into deposit_intents (vault, source_chain, source_address, amount, speed, fee_mode, intent, status, burn_tx, forward_tx, received, link_id) values (${vault.toLowerCase()}, 'Base_Sepolia', ${`0x${"34".repeat(20)}`}, 50000000, 'fast', 'source', 'income', 'arrived', ${`0x${"c2".repeat(32)}`}, ${forwardTx}, 50000000, ${link?.linkId ?? null})`;
    await setCursor(db.sql, vault, 0n);
    const chain = reader({ transfersTo: async () => [{ txHash: forwardTx, logIndex: 5, payer: `0x${"56".repeat(20)}` as `0x${string}`, amount: 50_000_000n, blockNumber: 110n }], receipt: async () => ({ status: "success", logs: [], blockNumber: 110n }) });
    const out = await scanVault(deps(chain), vault);
    expect(out.credited).toBe(1);
    expect((await getLinkByToken(db.sql, keys, created.token))?.status).toBe("paid");
  });
});
