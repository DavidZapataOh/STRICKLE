import { type InvoiceListItem, confirmSuggestion, createInvoice, dismissSuggestion, getCursor, listInvoices, rotateLink, setCursor, voidInvoice } from "@strickle/db/payments";
import { createHash } from "node:crypto";
import type { Address } from "viem";
import { z } from "zod";
import { parseAmountInput } from "../deposit/amount.ts";
import { requireOwner } from "./owner-session.ts";
import type { PayDeps } from "./pay.ts";
import { scanVault } from "./reconcile.ts";

export type InvoiceDeps = PayDeps;

export interface SerializedInvoice {
  id: string;
  label: string;
  payeeName: string;
  note: string;
  amount: string;
  paid: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  token: string;
  suggestions: { id: string; amount: string; payer: string; txHash: string; at: string }[];
  payments: { amount: string; state: string; rail: string; late: boolean; txHash: string; at: string }[];
}

type Outcome<T> = { status: number; body: T };
type Failure = { status: "rejected" | "unauthorized" | "not-found" | "rate-limited" | "unavailable" | "misconfigured" };

const MAX_BODY = 4_000;
const MAX_AMOUNT = 1_000_000_000_000n;
const fail = (status: number, kind: Failure["status"]): Outcome<Failure> => ({ status, body: { status: kind } });
const keyed = (scope: string, pepper: string, value: string) => `${scope}:${createHash("sha256").update(`${pepper}:${value}`).digest("hex")}`;

const serialize = (item: InvoiceListItem): SerializedInvoice => ({
  id: item.id,
  label: item.label,
  payeeName: item.payeeName,
  note: item.note,
  amount: item.amount.toString(),
  paid: item.paid.toString(),
  status: item.status,
  expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
  createdAt: item.createdAt.toISOString(),
  token: item.token,
  suggestions: item.suggestions.map((s) => ({ id: s.id, amount: s.amount.toString(), payer: s.payer, txHash: s.txHash, at: s.at.toISOString() })),
  payments: item.payments.map((p) => ({ amount: p.amount.toString(), state: p.state, rail: p.rail, late: p.late, txHash: p.txHash, at: p.at.toISOString() })),
});

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const createBody = z.object({
  label: z.string().min(1).max(80),
  payeeName: z.string().min(1).max(60),
  note: z.string().max(300),
  amount: z.string().regex(/^[0-9]{1,10}(\.[0-9]{1,6})?$/),
  expiresInDays: z.number().int().min(1).max(90).nullable(),
});

export async function handleCreateInvoice(request: Request, deps: InvoiceDeps): Promise<Outcome<{ status: "created"; id: string; token: string } | Failure>> {
  const vault = requireOwner(request, deps.keys);
  if (!vault) return fail(401, "unauthorized");
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return fail(503, "misconfigured");
  const parsed = createBody.safeParse(await readBody(request));
  if (!parsed.success) return fail(400, "rejected");
  const amount = parseAmountInput(parsed.data.amount);
  if (amount === null || amount > MAX_AMOUNT) return fail(400, "rejected");
  try {
    const budget = await deps.limiter.count(keyed("invoice-create", pepper, vault), 3_600, 60);
    if (!budget.allowed) return fail(429, "rate-limited");
    const expiresAt = parsed.data.expiresInDays === null ? null : new Date(Date.now() + parsed.data.expiresInDays * 86_400_000);
    const created = await createInvoice(deps.sql, deps.keys, { vault, label: parsed.data.label, payeeName: parsed.data.payeeName, note: parsed.data.note, amount, expiresAt });
    // the scan never walks a vault's older history: it starts where the first invoice was made
    if ((await getCursor(deps.sql, vault)) === null) await setCursor(deps.sql, vault, await deps.chain.head());
    return { status: 201, body: { status: "created", id: created.id, token: created.token } };
  } catch {
    return fail(502, "unavailable");
  }
}

export async function handleListInvoices(request: Request, deps: InvoiceDeps): Promise<Outcome<{ status: "ok"; invoices: SerializedInvoice[] } | Failure>> {
  const vault = requireOwner(request, deps.keys);
  if (!vault) return fail(401, "unauthorized");
  try {
    return { status: 200, body: { status: "ok", invoices: (await listInvoices(deps.sql, deps.keys, vault)).map(serialize) } };
  } catch {
    return fail(502, "unavailable");
  }
}

const actionBody = z.object({ action: z.enum(["rotate", "void", "confirm", "dismiss"]), paymentId: z.string().uuid().optional() });

export async function handleInvoiceAction(request: Request, id: string, deps: InvoiceDeps): Promise<Outcome<{ status: "ok"; token?: string } | Failure>> {
  const vault = requireOwner(request, deps.keys);
  if (!vault) return fail(401, "unauthorized");
  const parsed = actionBody.safeParse(await readBody(request));
  if (!parsed.success || !/^[0-9a-f-]{36}$/.test(id)) return fail(400, "rejected");
  const { action, paymentId } = parsed.data;
  try {
    if (action === "rotate") {
      const rotated = await rotateLink(deps.sql, deps.keys, vault, id);
      return rotated ? { status: 200, body: { status: "ok", token: rotated.token } } : fail(404, "not-found");
    }
    if (action === "void") return (await voidInvoice(deps.sql, vault, id)) ? { status: 200, body: { status: "ok" } } : fail(404, "not-found");
    if (!paymentId) return fail(400, "rejected");
    if (action === "dismiss") return (await dismissSuggestion(deps.sql, vault, paymentId)) ? { status: 200, body: { status: "ok" } } : fail(404, "not-found");
    const settled = await confirmSuggestion(deps.sql, vault, paymentId);
    return settled.outcome === "credited" || settled.outcome === "extra" ? { status: 200, body: { status: "ok" } } : fail(404, "not-found");
  } catch {
    return fail(502, "unavailable");
  }
}

export async function handleReconcile(request: Request, deps: InvoiceDeps): Promise<Outcome<{ status: "ok"; scanned: string; credited: number; suggested: number } | Failure>> {
  const vault = requireOwner(request, deps.keys);
  if (!vault) return fail(401, "unauthorized");
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return fail(503, "misconfigured");
  try {
    const wait = await deps.limiter.count(keyed("reconcile", pepper, vault), 10, 1);
    if (!wait.allowed) return fail(429, "rate-limited");
    const result = await scanVault(deps, vault as Address);
    return { status: 200, body: { status: "ok", scanned: result.scanned.toString(), credited: result.credited, suggested: result.suggested } };
  } catch {
    return fail(502, "unavailable");
  }
}
