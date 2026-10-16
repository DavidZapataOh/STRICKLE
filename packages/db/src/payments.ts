import { randomBytes, randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { getAddress } from "viem";
import { type InvoiceKeys, linkToken, tokenHash } from "./invoice-keys.ts";
import { open, seal } from "./seal.ts";

export type InvoiceStatus = "open" | "partial" | "paid" | "void";
export type PaymentState = "credited" | "extra" | "suggested" | "dismissed";
type Hex = `0x${string}`;

export interface NewInvoice {
  vault: string;
  label: string;
  payeeName: string;
  note: string;
  amount: bigint;
  expiresAt: Date | null;
}

export interface LinkView {
  invoiceId: string;
  linkId: string;
  vault: string;
  memoId: Hex;
  label: string;
  payeeName: string;
  note: string;
  amount: bigint;
  paid: bigint;
  status: InvoiceStatus;
  expiresAt: Date | null;
  revoked: boolean;
}

export interface SettleInput {
  chainId: number;
  txHash: string;
  logIndex: number;
  vault: string;
  payer: string;
  amount: bigint;
  rail: "direct" | "cctp";
  memoId?: string | null;
  linkId?: string | null;
  at: Date;
}

export type SettleResult = { outcome: "credited" | "extra"; invoiceId: string; status: InvoiceStatus; paid: bigint } | { outcome: "duplicate" } | { outcome: "unmatched" };

export interface InvoiceListItem {
  id: string;
  label: string;
  payeeName: string;
  note: string;
  amount: bigint;
  paid: bigint;
  status: InvoiceStatus;
  expiresAt: Date | null;
  createdAt: Date;
  token: string;
  suggestions: { id: string; amount: bigint; payer: string; txHash: string; at: Date }[];
  payments: { amount: bigint; state: PaymentState; rail: string; late: boolean; txHash: string; at: Date }[];
}

const MIN_AMOUNT = 10_000n;
const MAX_AMOUNT = 1_000_000_000_000n;
const lower = (value: string) => value.toLowerCase();

interface Texts {
  label: string;
  payeeName: string;
  note: string;
}
const sealTexts = (keys: InvoiceKeys, id: string, texts: Texts): Buffer => seal(keys.seal, Buffer.from(JSON.stringify(texts)), `invoice:${id}`);
const openTexts = (keys: InvoiceKeys, id: string, sealed: Buffer): Texts => JSON.parse(open(keys.seal, sealed, `invoice:${id}`).toString("utf8")) as Texts;

export async function createInvoice(sql: Sql, keys: InvoiceKeys, input: NewInvoice): Promise<{ id: string; memoId: Hex; token: string }> {
  if (input.label.length < 1 || input.label.length > 80) throw new Error("the label must be 1 to 80 characters");
  if (input.payeeName.length < 1 || input.payeeName.length > 60) throw new Error("the payee name must be 1 to 60 characters");
  if (input.note.length > 300) throw new Error("the note must be at most 300 characters");
  if (input.amount < MIN_AMOUNT || input.amount > MAX_AMOUNT) throw new Error("the amount is out of range");
  const id = randomUUID();
  const memoId = `0x${randomBytes(32).toString("hex")}` as Hex;
  const token = linkToken(keys, id, 1);
  await sql.begin(async (tx) => {
    await tx`insert into invoices (id, vault, sealed, amount, expires_at) values (${id}, ${lower(input.vault)}, ${sealTexts(keys, id, { label: input.label, payeeName: input.payeeName, note: input.note })}, ${input.amount.toString()}, ${input.expiresAt})`;
    await tx`insert into payment_links (invoice_id, token_hash, memo_id) values (${id}, ${tokenHash(token)}, ${memoId})`;
  });
  return { id, memoId, token };
}

interface LinkRow {
  invoice_id: string;
  link_id: string;
  vault: string;
  memo_id: string;
  sealed: Buffer;
  amount: string;
  paid: string;
  status: string;
  expires_at: Date | null;
  revoked: boolean;
}

const toView = (keys: InvoiceKeys, row: LinkRow): LinkView => ({
  invoiceId: row.invoice_id,
  linkId: row.link_id,
  vault: getAddress(row.vault),
  memoId: row.memo_id as Hex,
  ...openTexts(keys, row.invoice_id, row.sealed),
  amount: BigInt(row.amount),
  paid: BigInt(row.paid),
  status: row.status as InvoiceStatus,
  expiresAt: row.expires_at,
  revoked: row.revoked,
});

export async function getLinkByToken(sql: Sql, keys: InvoiceKeys, token: string): Promise<LinkView | null> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  const [row] = await sql<LinkRow[]>`select i.id as invoice_id, l.id as link_id, i.vault, l.memo_id, i.sealed, i.amount, i.paid, i.status, i.expires_at, l.revoked from payment_links l join invoices i on i.id = l.invoice_id where l.token_hash = ${tokenHash(token)}`;
  return row ? toView(keys, row) : null;
}

export async function getLinkByMemoId(sql: Sql, keys: InvoiceKeys, vault: string, memoId: string): Promise<LinkView | null> {
  const [row] = await sql<LinkRow[]>`select i.id as invoice_id, l.id as link_id, i.vault, l.memo_id, i.sealed, i.amount, i.paid, i.status, i.expires_at, l.revoked from payment_links l join invoices i on i.id = l.invoice_id where l.memo_id = ${lower(memoId)} and i.vault = ${lower(vault)}`;
  return row ? toView(keys, row) : null;
}

interface Credit {
  chainId: number;
  txHash: string;
  logIndex: number;
  vault: string;
  payer: string;
  amount: bigint;
  rail: "direct" | "cctp";
  at: Date;
}

/** Credits one payment to one invoice. A `suggested` row for the same log is promoted instead of inserted, so confirming a suggestion and settling by memo meet in one place. */
async function credit(tx: TransactionSql, invoiceId: string, payment: Credit): Promise<SettleResult> {
  const [invoice] = await tx<{ id: string; amount: string; paid: string; status: string; expires_at: Date | null }[]>`select id, amount, paid, status, expires_at from invoices where id = ${invoiceId} for update`;
  if (!invoice) return { outcome: "unmatched" };
  const key = { chain: payment.chainId, hash: lower(payment.txHash), index: payment.logIndex };
  const [existing] = await tx<{ id: string; state: string }[]>`select id, state from payments where chain_id = ${key.chain} and tx_hash = ${key.hash} and log_index = ${key.index} for update`;
  if (existing && existing.state !== "suggested") return { outcome: "duplicate" };
  const full = BigInt(invoice.paid) >= BigInt(invoice.amount) || invoice.status === "void";
  const state = full ? "extra" : "credited";
  const late = invoice.expires_at !== null && payment.at > invoice.expires_at;
  if (existing) {
    await tx`update payments set state = ${state}, invoice_id = ${invoice.id}, rail = ${payment.rail}, late = ${late} where id = ${existing.id}`;
  } else {
    const inserted = await tx`insert into payments (chain_id, tx_hash, log_index, vault, invoice_id, payer, amount, rail, state, late, at)
      values (${key.chain}, ${key.hash}, ${key.index}, ${lower(payment.vault)}, ${invoice.id}, ${lower(payment.payer)}, ${payment.amount.toString()}, ${payment.rail}, ${state}, ${late}, ${payment.at})
      on conflict (chain_id, tx_hash, log_index) do nothing returning id`;
    if (inserted.length === 0) return { outcome: "duplicate" };
  }
  const paid = BigInt(invoice.paid) + payment.amount;
  const status = invoice.status === "void" ? "void" : paid >= BigInt(invoice.amount) ? "paid" : "partial";
  await tx`update invoices set paid = ${paid.toString()}, status = ${status}, updated_at = now() where id = ${invoice.id}`;
  return { outcome: state, invoiceId: invoice.id, status: status as InvoiceStatus, paid };
}

export async function settlePayment(sql: Sql, input: SettleInput): Promise<SettleResult> {
  return sql.begin(async (tx) => {
    const rows = input.linkId
      ? await tx<{ invoice_id: string }[]>`select l.invoice_id from payment_links l join invoices i on i.id = l.invoice_id where l.id = ${input.linkId} and i.vault = ${lower(input.vault)}`
      : input.memoId
        ? await tx<{ invoice_id: string }[]>`select l.invoice_id from payment_links l join invoices i on i.id = l.invoice_id where l.memo_id = ${lower(input.memoId)} and i.vault = ${lower(input.vault)}`
        : [];
    const link = rows[0];
    if (!link) return { outcome: "unmatched" } as const;
    return credit(tx, link.invoice_id, input);
  });
}

export async function suggestMatch(sql: Sql, input: { chainId: number; txHash: string; logIndex: number; vault: string; payer: string; amount: bigint; at: Date }): Promise<{ suggested: boolean }> {
  return sql.begin(async (tx) => {
    const key = { hash: lower(input.txHash) };
    const [existing] = await tx`select id from payments where chain_id = ${input.chainId} and tx_hash = ${key.hash} and log_index = ${input.logIndex}`;
    if (existing) return { suggested: false };
    const [candidate] = await tx<{ id: string }[]>`select id from invoices where vault = ${lower(input.vault)} and status in ('open', 'partial') and created_at <= ${input.at}::timestamptz + interval '5 seconds' and (amount = ${input.amount.toString()} or amount - paid = ${input.amount.toString()}) order by created_at desc limit 1`;
    if (!candidate) return { suggested: false };
    const inserted = await tx`insert into payments (chain_id, tx_hash, log_index, vault, invoice_id, payer, amount, rail, state, at)
      values (${input.chainId}, ${key.hash}, ${input.logIndex}, ${lower(input.vault)}, ${candidate.id}, ${lower(input.payer)}, ${input.amount.toString()}, 'direct', 'suggested', ${input.at})
      on conflict (chain_id, tx_hash, log_index) do nothing returning id`;
    return { suggested: inserted.length === 1 };
  });
}

export async function confirmSuggestion(sql: Sql, vault: string, paymentId: string): Promise<SettleResult> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ chain_id: number; tx_hash: string; log_index: number; payer: string; amount: string; at: Date; invoice_id: string }[]>`select chain_id, tx_hash, log_index, payer, amount, at, invoice_id from payments where id = ${paymentId} and vault = ${lower(vault)} and state = 'suggested'`;
    if (!row) return { outcome: "duplicate" } as const;
    return credit(tx, row.invoice_id, { chainId: row.chain_id, txHash: row.tx_hash, logIndex: row.log_index, vault, payer: row.payer, amount: BigInt(row.amount), rail: "direct", at: row.at });
  });
}

export async function dismissSuggestion(sql: Sql, vault: string, paymentId: string): Promise<boolean> {
  const rows = await sql`update payments set state = 'dismissed' where id = ${paymentId} and vault = ${lower(vault)} and state = 'suggested' returning id`;
  return rows.length === 1;
}

export async function rotateLink(sql: Sql, keys: InvoiceKeys, vault: string, invoiceId: string): Promise<{ token: string } | null> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; version: number }[]>`select l.id, l.version from payment_links l join invoices i on i.id = l.invoice_id where i.id = ${invoiceId} and i.vault = ${lower(vault)} for update of l`;
    if (!row) return null;
    const version = row.version + 1;
    const token = linkToken(keys, invoiceId, version);
    await tx`update payment_links set version = ${version}, token_hash = ${tokenHash(token)}, revoked = false where id = ${row.id}`;
    return { token };
  });
}

export async function voidInvoice(sql: Sql, vault: string, invoiceId: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const rows = await tx`update invoices set status = 'void', updated_at = now() where id = ${invoiceId} and vault = ${lower(vault)} returning id`;
    if (rows.length === 0) return false;
    await tx`update payment_links set revoked = true where invoice_id = ${invoiceId}`;
    return true;
  });
}

export async function listInvoices(sql: Sql, keys: InvoiceKeys, vault: string): Promise<InvoiceListItem[]> {
  const invoices = await sql<{ id: string; sealed: Buffer; amount: string; paid: string; status: string; expires_at: Date | null; created_at: Date; version: number }[]>`select i.id, i.sealed, i.amount, i.paid, i.status, i.expires_at, i.created_at, l.version from invoices i join payment_links l on l.invoice_id = i.id where i.vault = ${lower(vault)} order by i.created_at desc`;
  const payments = await sql<{ invoice_id: string; id: string; amount: string; payer: string; state: string; rail: string; late: boolean; tx_hash: string; at: Date }[]>`select invoice_id, id, amount, payer, state, rail, late, tx_hash, at from payments where vault = ${lower(vault)} and invoice_id is not null and state <> 'dismissed' order by at desc`;
  return invoices.map((row) => {
    const own = payments.filter((payment) => payment.invoice_id === row.id);
    return {
      id: row.id,
      ...openTexts(keys, row.id, row.sealed),
      amount: BigInt(row.amount),
      paid: BigInt(row.paid),
      status: row.status as InvoiceStatus,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      token: linkToken(keys, row.id, row.version),
      suggestions: own.filter((payment) => payment.state === "suggested").map((payment) => ({ id: payment.id, amount: BigInt(payment.amount), payer: getAddress(payment.payer), txHash: payment.tx_hash, at: payment.at })),
      payments: own.filter((payment) => payment.state !== "suggested").map((payment) => ({ amount: BigInt(payment.amount), state: payment.state as PaymentState, rail: payment.rail, late: payment.late, txHash: payment.tx_hash, at: payment.at })),
    };
  });
}

export async function getCursor(sql: Sql, vault: string): Promise<bigint | null> {
  const [row] = await sql<{ block: string }[]>`select block from payment_cursors where vault = ${lower(vault)}`;
  return row ? BigInt(row.block) : null;
}

export async function setCursor(sql: Sql, vault: string, block: bigint): Promise<void> {
  await sql`insert into payment_cursors (vault, block) values (${lower(vault)}, ${block.toString()}) on conflict (vault) do update set block = greatest(payment_cursors.block, excluded.block), updated_at = now()`;
}

export async function useNonce(sql: Sql, vault: string, nonce: string, deadline: Date): Promise<boolean> {
  await sql`delete from owner_nonces where deadline < now() - interval '1 hour'`;
  const rows = await sql`insert into owner_nonces (vault, nonce, deadline) values (${lower(vault)}, ${nonce}, ${deadline}) on conflict do nothing returning nonce`;
  return rows.length === 1;
}
