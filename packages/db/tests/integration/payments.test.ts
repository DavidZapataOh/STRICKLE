import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invoiceKeys } from "../../src/invoice-keys.ts";
import { migrate } from "../../src/migrate.ts";
import { confirmSuggestion, createInvoice, dismissSuggestion, getCursor, getLinkByMemoId, getLinkByToken, listInvoices, rotateLink, setCursor, settlePayment, suggestMatch, useNonce, voidInvoice } from "../../src/payments.ts";
import { createTestDatabase } from "../../src/testing.ts";

const keys = invoiceKeys(randomBytes(32).toString("base64"));
const VAULT = getAddress(`0x${"ab".repeat(20)}`);
const OTHER = `0x${"cd".repeat(20)}`;
const PAYER = `0x${"ee".repeat(20)}`;
const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterAll(async () => db.drop());

const invoice = async (amount = 100_000_000n, vault = VAULT) => createInvoice(db.sql, keys, { vault, label: "Website redesign", payeeName: "Ana Studio", note: "October", amount, expiresAt: new Date(Date.now() + 86_400_000) });
const pay = (id: string, memoId: string, amount: bigint, n: number, extra: Partial<Parameters<typeof settlePayment>[1]> = {}) => settlePayment(db.sql, { chainId: 5042002, txHash: TX(n), logIndex: 1, vault: VAULT, payer: PAYER, amount, rail: "direct", memoId, at: new Date(), ...extra });

describe("links", () => {
  it("shows an invoice by its token and keeps the freelancer's text sealed at rest", async () => {
    const created = await invoice();
    const view = await getLinkByToken(db.sql, keys, created.token);
    expect(view).toMatchObject({ label: "Website redesign", payeeName: "Ana Studio", note: "October", amount: 100_000_000n, paid: 0n, status: "open", vault: VAULT, revoked: false });
    const [row] = await db.sql<{ sealed: Buffer }[]>`select sealed from invoices where id = ${created.id}`;
    expect(row?.sealed.toString("utf8")).not.toContain("Website");
    expect(await getLinkByToken(db.sql, keys, "not-a-token")).toBeNull();
  });

  it("rotating issues a new token: the old one stops working and the memo id keeps crediting", async () => {
    const created = await invoice();
    const rotated = await rotateLink(db.sql, keys, VAULT, created.id);
    expect(rotated?.token).not.toBe(created.token);
    expect(await getLinkByToken(db.sql, keys, created.token)).toBeNull();
    expect(await getLinkByToken(db.sql, keys, rotated?.token as string)).toMatchObject({ revoked: false });
    expect(await getLinkByMemoId(db.sql, keys, VAULT, created.memoId)).toMatchObject({ revoked: false });
    expect((await pay(created.id, created.memoId, 100_000_000n, 90)).outcome).toBe("credited");
    expect(await rotateLink(db.sql, keys, OTHER, created.id)).toBeNull(); // not this vault's invoice
  });

  it("voiding closes the link for payers and later money still counts, as extra", async () => {
    const created = await invoice();
    expect(await voidInvoice(db.sql, OTHER, created.id)).toBe(false);
    expect(await voidInvoice(db.sql, VAULT, created.id)).toBe(true);
    expect(await getLinkByToken(db.sql, keys, created.token)).toMatchObject({ revoked: true, status: "void" });
    expect((await pay(created.id, created.memoId, 5_000_000n, 91)).outcome).toBe("extra");
  });
});

describe("settlement", () => {
  it("credits an exact payment and marks the invoice paid", async () => {
    const created = await invoice();
    expect(await pay(created.id, created.memoId, 100_000_000n, 1)).toMatchObject({ outcome: "credited", status: "paid", paid: 100_000_000n });
  });

  it("is idempotent on (chain, transaction, log)", async () => {
    const created = await invoice();
    await pay(created.id, created.memoId, 40_000_000n, 2);
    expect(await pay(created.id, created.memoId, 40_000_000n, 2)).toEqual({ outcome: "duplicate" });
    expect((await getLinkByMemoId(db.sql, keys, VAULT, created.memoId))?.paid).toBe(40_000_000n);
  });

  it("two racing settlements of the same payment credit once", async () => {
    const created = await invoice();
    const results = await Promise.all([pay(created.id, created.memoId, 100_000_000n, 3), pay(created.id, created.memoId, 100_000_000n, 3)]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["credited", "duplicate"]);
  });

  it("leaves the invoice partial after an underpayment and paid once the rest arrives", async () => {
    const created = await invoice();
    expect(await pay(created.id, created.memoId, 60_000_000n, 4)).toMatchObject({ status: "partial", paid: 60_000_000n });
    expect(await pay(created.id, created.memoId, 40_000_000n, 5)).toMatchObject({ outcome: "credited", status: "paid", paid: 100_000_000n });
  });

  it("records an overpayment and a payment after paid as extra, never as lost", async () => {
    const created = await invoice();
    expect(await pay(created.id, created.memoId, 130_000_000n, 6)).toMatchObject({ status: "paid", paid: 130_000_000n });
    expect(await pay(created.id, created.memoId, 10_000_000n, 7)).toMatchObject({ outcome: "extra", paid: 140_000_000n });
  });

  it("flags a payment that arrives after the link expired, and still credits it", async () => {
    const created = await invoice();
    const result = await pay(created.id, created.memoId, 100_000_000n, 8, { at: new Date(Date.now() + 10 * 86_400_000) });
    expect(result).toMatchObject({ outcome: "credited" });
    const [row] = await db.sql<{ late: boolean }[]>`select late from payments where tx_hash = ${TX(8)}`;
    expect(row?.late).toBe(true);
  });

  it("does not credit a memo id of another vault, nor an unknown one", async () => {
    const created = await invoice();
    expect(await pay(created.id, created.memoId, 1_000_000n, 9, { vault: OTHER })).toEqual({ outcome: "unmatched" });
    expect(await pay(created.id, `0x${"00".repeat(32)}`, 1_000_000n, 10)).toEqual({ outcome: "unmatched" });
  });

  it("credits a cross-chain payment through the link it was bound to, with no memo", async () => {
    const created = await invoice();
    const link = await getLinkByToken(db.sql, keys, created.token);
    const result = await settlePayment(db.sql, { chainId: 5042002, txHash: TX(11), logIndex: 4, vault: VAULT, payer: PAYER, amount: 99_990_000n, rail: "cctp", linkId: link?.linkId, at: new Date() });
    expect(result).toMatchObject({ outcome: "credited", status: "partial", paid: 99_990_000n });
  });
});

describe("suggestions for payments nobody reported", () => {
  it("proposes an open invoice of exactly that amount and credits it only when the owner confirms", async () => {
    const created = await invoice(77_000_000n);
    expect(await suggestMatch(db.sql, { chainId: 5042002, txHash: TX(20), logIndex: 2, vault: VAULT, payer: PAYER, amount: 77_000_000n, at: new Date() })).toEqual({ suggested: true });
    const items = await listInvoices(db.sql, keys, VAULT);
    const item = items.find((entry) => entry.id === created.id);
    expect(item?.suggestions).toHaveLength(1);
    const [suggestion] = item?.suggestions ?? [];
    expect(item?.paid).toBe(0n);
    expect(await confirmSuggestion(db.sql, VAULT, suggestion?.id as string)).toMatchObject({ outcome: "credited", status: "paid" });
    expect(await confirmSuggestion(db.sql, VAULT, suggestion?.id as string)).toEqual({ outcome: "duplicate" });
  });

  it("proposes nothing when no open invoice has that amount, and never twice for the same log", async () => {
    expect(await suggestMatch(db.sql, { chainId: 5042002, txHash: TX(21), logIndex: 2, vault: VAULT, payer: PAYER, amount: 1_234n, at: new Date() })).toEqual({ suggested: false });
    const created = await invoice(55_000_000n);
    const input = { chainId: 5042002, txHash: TX(22), logIndex: 2, vault: VAULT, payer: PAYER, amount: 55_000_000n, at: new Date() };
    expect((await suggestMatch(db.sql, input)).suggested).toBe(true);
    expect((await suggestMatch(db.sql, input)).suggested).toBe(false);
    const item = (await listInvoices(db.sql, keys, VAULT)).find((entry) => entry.id === created.id);
    expect(item?.suggestions).toHaveLength(1);
  });

  it("does not suggest a payment that was already credited through its memo", async () => {
    const created = await invoice(31_000_000n);
    await settlePayment(db.sql, { chainId: 5042002, txHash: TX(23), logIndex: 2, vault: VAULT, payer: PAYER, amount: 31_000_000n, rail: "direct", memoId: created.memoId, at: new Date() });
    expect((await suggestMatch(db.sql, { chainId: 5042002, txHash: TX(23), logIndex: 2, vault: VAULT, payer: PAYER, amount: 31_000_000n, at: new Date() })).suggested).toBe(false);
  });

  it("lets the owner dismiss a suggestion, and only the owner of that vault", async () => {
    await invoice(44_000_000n);
    await suggestMatch(db.sql, { chainId: 5042002, txHash: TX(24), logIndex: 2, vault: VAULT, payer: PAYER, amount: 44_000_000n, at: new Date() });
    const [row] = await db.sql<{ id: string }[]>`select id from payments where tx_hash = ${TX(24)}`;
    expect(await dismissSuggestion(db.sql, OTHER, row?.id as string)).toBe(false);
    expect(await dismissSuggestion(db.sql, VAULT, row?.id as string)).toBe(true);
  });
});

describe("races and edges found in review", () => {
  it("credits a payment the scan only suggested, when the payer's claim arrives second", async () => {
    const created = await invoice(66_000_000n);
    await suggestMatch(db.sql, { chainId: 5042002, txHash: TX(30), logIndex: 2, vault: VAULT, payer: PAYER, amount: 66_000_000n, at: new Date() });
    expect(await pay(created.id, created.memoId, 66_000_000n, 30, { logIndex: 2 })).toMatchObject({ outcome: "credited", status: "paid" });
  });

  it("does not rotate the link of a void invoice", async () => {
    const created = await invoice();
    await voidInvoice(db.sql, VAULT, created.id);
    expect(await rotateLink(db.sql, keys, VAULT, created.id)).toBeNull();
  });

  it("offers a transfer a cent over the remaining amount, because fees are rounded up to the cent", async () => {
    await invoice(88_000_000n);
    expect(await suggestMatch(db.sql, { chainId: 5042002, txHash: TX(31), logIndex: 2, vault: VAULT, payer: PAYER, amount: 88_004_000n, at: new Date() })).toEqual({ suggested: true });
    expect(await suggestMatch(db.sql, { chainId: 5042002, txHash: TX(32), logIndex: 2, vault: VAULT, payer: PAYER, amount: 88_020_000n, at: new Date() })).toEqual({ suggested: false });
  });
});

describe("cursors and nonces", () => {
  it("keeps one cursor per vault and moves it forward only", async () => {
    expect(await getCursor(db.sql, VAULT)).toBeNull();
    await setCursor(db.sql, VAULT, 100n);
    await setCursor(db.sql, VAULT, 90n);
    expect(await getCursor(db.sql, VAULT)).toBe(100n);
    await setCursor(db.sql, VAULT, 120n);
    expect(await getCursor(db.sql, VAULT)).toBe(120n);
  });

  it("accepts a nonce once", async () => {
    const deadline = new Date(Date.now() + 60_000);
    expect(await useNonce(db.sql, VAULT, "1", deadline)).toBe(true);
    expect(await useNonce(db.sql, VAULT, "1", deadline)).toBe(false);
    expect(await useNonce(db.sql, OTHER, "1", deadline)).toBe(true);
  });
});
