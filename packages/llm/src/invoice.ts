import { type PlainDate, daysBetween, parsePlainDate } from "@strickle/core";

export const CURRENCIES = ["USD", "EUR", "MXN", "BRL", "COP", "ARS"] as const;

export interface InvoiceFields {
  issuer: string;
  currency: string;
  total: string;
  lines: { description: string; amount: string }[];
  issueDate: string;
  dueDate: string;
  terms?: { discountPercent: string; discountDays: number; netDays: number };
}

const values = new WeakMap<object, InvoiceFields>();

/** Values read by a model. They live in a module-private map: the object has no property to read; only `preview` (strings for display) and `confirm` can look inside. */
export class Unconfirmed {
  private constructor() {}
  static of(value: InvoiceFields): Unconfirmed {
    const instance = new Unconfirmed();
    values.set(instance, value);
    return instance;
  }
  preview(): Readonly<Record<string, string>> {
    const v = values.get(this) as InvoiceFields;
    return { issuer: v.issuer, currency: v.currency, total: v.total, issueDate: v.issueDate, dueDate: v.dueDate };
  }
}

export interface Confirmed {
  issuer: string;
  currency: string;
  totalMinor: bigint;
  dueDate: PlainDate;
  /** Early-payment terms read from the invoice, parsed; absent when the invoice has none. */
  terms?: { discountBps: number; discountDays: number; netDays: number };
}

const MONEY = /^\d+\.\d{2}$|^\d+$/;
const minor = (text: string): bigint => {
  const [whole = "0", fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
};

function dateOk(text: unknown): PlainDate | undefined {
  try {
    return typeof text === "string" ? parsePlainDate(text) : undefined;
  } catch {
    return undefined;
  }
}

function termsOk(raw: unknown): { ok: true; terms?: NonNullable<InvoiceFields["terms"]> } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw !== "object") return { ok: false };
  const t = raw as Record<string, unknown>;
  const percent = typeof t.discountPercent === "string" && /^\d{1,3}(\.\d{1,2})?$/.test(t.discountPercent) ? t.discountPercent : undefined;
  const dd = t.discountDays;
  const nd = t.netDays;
  const validDays = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 365;
  if (!percent || Number(percent) > 100 || !validDays(dd) || !validDays(nd) || dd > nd) return { ok: false };
  return { ok: true, terms: { discountPercent: percent, discountDays: dd, netDays: nd } };
}

export function invoiceValid(raw: unknown): { ok: true; invoice: Unconfirmed } | { ok: false; problems: string[] } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, problems: ["the invoice must be an object"] };
  const r = raw as Record<string, unknown>;
  const problems: string[] = [];

  const issuer = typeof r.issuer === "string" ? r.issuer.trim() : "";
  if (issuer === "" || issuer.length > 120) problems.push("issuer: required, at most 120 characters");
  const currency = typeof r.currency === "string" ? r.currency : "";
  if (!(CURRENCIES as readonly string[]).includes(currency)) problems.push("currency: not supported");
  const total = typeof r.total === "string" && MONEY.test(r.total) ? r.total : undefined;
  if (!total) problems.push("total: must be a decimal with at most two decimals");

  const lines: InvoiceFields["lines"] = [];
  if (!Array.isArray(r.lines) || r.lines.length === 0) problems.push("lines: at least one line is required");
  else {
    for (const line of r.lines as { description?: unknown; amount?: unknown }[]) {
      const amount = typeof line?.amount === "string" && MONEY.test(line.amount) ? line.amount : undefined;
      if (!amount || typeof line.description !== "string") problems.push("lines: each line needs a description and a non-negative amount");
      else lines.push({ description: line.description.slice(0, 200), amount });
    }
  }
  if (total && lines.length > 0 && problems.length === 0 && lines.reduce((sum, line) => sum + minor(line.amount), 0n) !== minor(total)) problems.push("lines: the lines do not sum to the total");

  const issue = dateOk(r.issueDate);
  const due = dateOk(r.dueDate);
  if (!issue) problems.push("issueDate: not a valid YYYY-MM-DD date");
  if (!due) problems.push("dueDate: not a valid YYYY-MM-DD date");
  if (issue && due && daysBetween(issue, due) < 0) problems.push("dueDate: before the issue date");

  const terms = termsOk(r.terms);
  if (!terms.ok) problems.push("terms: discount percent, discount days and net days are not valid");

  if (problems.length > 0 || !total || !issue || !due || !terms.ok) return { ok: false, problems };
  const fields: InvoiceFields = { issuer, currency, total, lines, issueDate: r.issueDate as string, dueDate: r.dueDate as string };
  if (terms.terms) fields.terms = terms.terms;
  return { ok: true, invoice: Unconfirmed.of(fields) };
}

/** The only way to read the amounts: the user types the total and the due date themselves and they must match. */
export function confirm(invoice: Unconfirmed, entered: { total: string; dueDate: string }): Confirmed | { error: "mismatch" } {
  const v = values.get(invoice);
  if (!v || !MONEY.test(entered.total) || minor(entered.total) !== minor(v.total) || entered.dueDate !== v.dueDate) return { error: "mismatch" };
  const confirmed: Confirmed = { issuer: v.issuer, currency: v.currency, totalMinor: minor(v.total), dueDate: parsePlainDate(v.dueDate) };
  if (v.terms) confirmed.terms = { discountBps: Math.round(Number(v.terms.discountPercent) * 100), discountDays: v.terms.discountDays, netDays: v.terms.netDays };
  return confirmed;
}
