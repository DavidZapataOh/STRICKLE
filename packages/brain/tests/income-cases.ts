import { parsePlainDate } from "@strickle/core";
import type { Arrival, Expectation, IncomeContext, Part, Sent } from "../src/income.ts";

const USDC = (dollars: number): bigint => BigInt(Math.round(dollars * 1_000_000));
const day = (text: string) => parsePlainDate(text);
const NOW = Date.UTC(2026, 10, 10) / 1000;
const TODAY = "2026-11-10";
const ME = "0x00000000000000000000000000000000000000a1";
const X = "0x00000000000000000000000000000000000000b2";
const VENDOR = "0x00000000000000000000000000000000000000c3";
const STRANGER = "0x00000000000000000000000000000000000000d4";
const FORWARDER = "0x00000000000000000000000000000000000000f5";

export interface Case {
  name: string;
  arrival: Arrival;
  context: Partial<IncomeContext>;
  parts: Pick<Part, "amount" | "class" | "basis" | "flags">[];
}

const arrival = (amount: number, sender: string | null, asset: "USDC" | "EURC" = "USDC"): Arrival => ({ id: "arrival-1", asset, amount: USDC(amount), sender, date: day(TODAY) });
const sent = (to: string, amount: number, date: string, kind: "own" | "payee" = "own", asset: "USDC" | "EURC" = "USDC"): Sent => ({ to, asset, amount: USDC(amount), date: day(date), kind });
const expect_ = (min: number, max: number, expiresIn = 3_600, asset: "USDC" | "EURC" = "USDC"): Expectation => ({ id: "e1", asset, min: USDC(min), max: USDC(max), expiresAt: NOW + expiresIn });
const part = (amount: number, cls: Part["class"], basis: Part["basis"], flags: Part["flags"] = []) => ({ amount: USDC(amount), class: cls, basis, flags });

export const CASES: Case[] = [
  { name: "1 an unknown sender is income, silently", arrival: arrival(1_200, STRANGER), context: {}, parts: [part(1_200, "income", "default")] },
  { name: "2 the user's own address is income with a doubt, because paying yourself is a normal way to get paid", arrival: arrival(500, ME), context: { owners: [ME] }, parts: [part(500, "income", "default", ["own-address"])] },
  { name: "3 the same deposit declared as the user's own money is not income", arrival: arrival(500, ME), context: { owners: [ME], expectations: [expect_(490, 500)] }, parts: [part(500, "own-transfer", "intent")] },
  { name: "4 a declared deposit that came through Circle's forwarder is matched by amount, not by sender", arrival: arrival(499.98, FORWARDER), context: { expectations: [expect_(499.9, 500)] }, parts: [part(499.98, "own-transfer", "intent")] },
  { name: "5 a declaration that has expired changes nothing", arrival: arrival(500, ME), context: { owners: [ME], expectations: [expect_(490, 500, -1)] }, parts: [part(500, "income", "default", ["own-address"])] },
  { name: "6 a declaration whose amount window does not contain the arrival changes nothing", arrival: arrival(900, STRANGER), context: { expectations: [expect_(490, 500)] }, parts: [part(900, "income", "default")] },
  { name: "7 a declaration for another asset changes nothing", arrival: arrival(500, STRANGER, "EURC"), context: { expectations: [expect_(490, 500)] }, parts: [part(500, "income", "default")] },
  { name: "8 money sent out three days ago comes back whole: not income", arrival: arrival(300, X), context: { sent: [sent(X, 300, "2026-11-07")] }, parts: [part(300, "own-transfer", "outflow-return")] },
  { name: "9 more comes back than went out: the returned part is not income, the rest is", arrival: arrival(450, X), context: { sent: [sent(X, 300, "2026-11-07")] }, parts: [part(300, "own-transfer", "outflow-return"), part(150, "income", "default")] },
  { name: "10 less comes back than went out: all of it is the return, and the rest stays outstanding", arrival: arrival(100, X), context: { sent: [sent(X, 300, "2026-11-07")] }, parts: [part(100, "own-transfer", "outflow-return")] },
  { name: "11 an outflow outside the 90-day window no longer proves anything, but an equal amount is a doubt", arrival: arrival(300, X), context: { sent: [sent(X, 300, "2026-08-01")] }, parts: [part(300, "income", "default", ["amount-matches-outflow"])] },
  { name: "12 a payee returns what it was paid: a refund", arrival: arrival(80, VENDOR), context: { sent: [sent(VENDOR, 80, "2026-11-01", "payee")] }, parts: [part(80, "refund", "outflow-return")] },
  { name: "13 a payee sends more than it was paid: the refund and the income are separate parts", arrival: arrival(95, VENDOR), context: { sent: [sent(VENDOR, 80, "2026-11-01", "payee")] }, parts: [part(80, "refund", "outflow-return"), part(15, "income", "default")] },
  { name: "14 an outflow in another asset proves nothing", arrival: arrival(300, X, "EURC"), context: { sent: [sent(X, 300, "2026-11-07")] }, parts: [part(300, "income", "default")] },
  { name: "15 two outflows to the same address are consumed oldest first", arrival: arrival(250, X), context: { sent: [sent(X, 100, "2026-10-20"), sent(X, 200, "2026-11-05")] }, parts: [part(100, "own-transfer", "outflow-return"), part(150, "own-transfer", "outflow-return")] },
  { name: "16 an arrival far above anything seen is income with a doubt", arrival: arrival(40_000, STRANGER), context: { recentMax: USDC(3_000) }, parts: [part(40_000, "income", "default", ["outlier-size"])] },
  { name: "17 an arrival of exactly ten times the recent maximum is not an outlier", arrival: arrival(30_000, STRANGER), context: { recentMax: USDC(3_000) }, parts: [part(30_000, "income", "default")] },
  { name: "18 an arrival with no known sender is income with a doubt", arrival: arrival(700, null), context: {}, parts: [part(700, "income", "default", ["unattributed"])] },
  { name: "19 intent wins over a matching outflow", arrival: arrival(300, X), context: { sent: [sent(X, 300, "2026-11-07")], expectations: [expect_(290, 300)] }, parts: [part(300, "own-transfer", "intent")] },
  { name: "20 a euro arrival from a payer seen before is plain income", arrival: arrival(1_200, STRANGER, "EURC"), context: {}, parts: [part(1_200, "income", "default")] },
];

export const baseContext = (over: Partial<IncomeContext>): IncomeContext => ({ now: NOW, owners: [], expectations: [], sent: [], recentMax: 0n, ...over });
