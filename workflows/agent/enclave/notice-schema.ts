import { z } from "zod";

const units = z.string().regex(/^[0-9]{1,30}$/);
const signed = z.string().regex(/^-?[0-9]{1,30}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash32 = z.string().regex(/^0x[0-9a-f]{64}$/);

const swapBox = z.enum(["payroll", "operating", "emergency", "profit", "taxes", "salary"]);
const earnBox = z.enum(["taxes", "payroll", "operating", "emergency", "profit"]);

export const BINDINGS = ["full", "taxes-not-covered", "insufficient-history", "spend-unknown", "cushion-floor", "scenario-risk", "salary-box"] as const;

export const planNoticeSchema = z
  .object({
    kind: z.literal("plan"),
    asOf: date,
    salary: z
      .object({
        next: date,
        owed: units,
        safeNow: units,
        pending: units,
        binding: z.enum(BINDINGS),
        aboveFloorBps: z.number().int().min(0).max(10_000),
        lastPaid: z.string().regex(/^(\d{4}-\d{2})?$/),
        needsApproval: z.boolean(),
        halted: z.boolean(),
      })
      .strict(),
    proposals: z.array(z.object({ id: z.string().max(24), amount: units, expiresAt: z.number().int().min(0) }).strict()).max(4),
    cushion: z.object({ days: z.number().int().min(0).nullable(), floorDays: z.number().int().min(0), targetDays: z.number().int().min(0) }).strict(),
    forecast: z.object({ floor: units, opening: units, p10: z.array(signed).max(26), p50: z.array(signed).max(26), basis: z.enum(["estimate", "observed"]) }).strict(),
    events: z.array(z.object({ date, kind: z.enum(["salary", "payroll", "tax"]), amount: units.nullable() }).strict()).max(8),
    targets: z.object({ taxes: units, payroll: units, salary: units, operating: units, emergency: units }).strict(),
    rates: z
      .object({ taxBps: z.number().int().min(0).max(10_000), fx: z.object({ usdcUsd: units, eurcUsd: units, at: z.number().int().min(0) }).strict().optional() })
      .strict(),
    settings: z
      .object({
        proposed: units,
        day: z.number().int().min(1).max(28),
        payee: address,
        dailyCap: units,
        signatureThreshold: units,
        floorDays: z.number().int().min(0),
        targetDays: z.number().int().min(0),
        halted: z.boolean(),
        haltCodes: z.array(z.string().max(32)).max(7),
        currencies: z.object({ payroll: z.enum(["USD", "EUR"]), operating: z.enum(["USD", "EUR"]), emergency: z.enum(["USD", "EUR"]), profit: z.enum(["USD", "EUR"]) }).strict().optional(),
        yieldEnabled: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const noticeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("proposal"), proposalId: z.string(), amount: units, payee: address, digest: hash32, expiresAt: z.number().int() }).strict(),
  z.object({ kind: z.literal("salary"), month: z.string(), paid: units, pending: units }).strict(),
  z.object({ kind: z.literal("decision"), proposalId: z.string(), status: z.enum(["approved", "rejected", "executed"]) }).strict(),
  z.object({ kind: z.literal("income-doubt"), arrivalId: z.string(), asset: z.enum(["USDC", "EURC"]), amount: units, flags: z.array(z.enum(["own-address", "amount-matches-outflow", "outlier-size", "unattributed"])).min(1).max(4), sender: address.or(z.literal("")) }).strict(),
  z.object({ kind: z.literal("reclassified"), arrivalId: z.string(), amount: units, from: z.enum(["income", "own-transfer", "refund"]), to: z.enum(["income", "own-transfer", "refund"]) }).strict(),
  z.object({ kind: z.literal("swap"), box: swapBox, from: z.enum(["USDC", "EURC"]), amountIn: units, estimatedOut: units, minOut: units, referenceOut: units, deviationBps: z.number().int(), feeBps: z.number().int().min(0).max(10_000) }).strict(),
  z.object({ kind: z.literal("swap-held"), box: swapBox, reason: z.enum(["worse-than-reference", "better-than-reference", "stale-feed", "adapter-not-approved", "failures", "daily-cap", "invalid-quote", "quote-unavailable", "vault-refused"]) }).strict(),
  // for a deposit `amount` is the dollars put to work and `counter` the shares received; for a withdrawal `amount` is the dollars taken back and `counter` the shares redeemed
  z.object({ kind: z.literal("earn"), box: earnBox, deposit: z.boolean(), name: z.string().max(40), protocol: z.string().max(24), vault: address, amount: units, counter: units, apyBps: z.number().int().min(0).max(100_000), gain: units.optional(), fee: units.optional() }).strict(),
  z.object({ kind: z.literal("earn-held"), box: earnBox, deposit: z.boolean(), name: z.string().max(40), reason: z.enum(["adapter-not-approved", "vault-not-approved", "quote-unavailable", "invalid-bundle", "vault-refused", "failures", "insufficient", "expired"]) }).strict(),
  // the agent took everything out of a vault that misbehaved, one notice per box
  z.object({ kind: z.literal("yield-exit"), box: earnBox, name: z.string().max(40), reason: z.enum(["price-drop", "rate-spike", "inactive", "illiquid"]) }).strict(),
  // why the agent put money to work (what it kept and the part of that needed within 60 days), and why it brought some back (the payment and its date)
  z.object({ kind: z.literal("yield-plan"), box: earnBox, amount: units, kept: units, needed: units }).strict(),
  z.object({ kind: z.literal("yield-back"), box: earnBox, amount: units, payment: units, due: date }).strict(),
  // the one invitation to an account that has yield off, with the rate the agent saw
  z.object({ kind: z.literal("yield-invite"), apyBps: z.number().int().min(1).max(100_000) }).strict(),
  planNoticeSchema,
]);

export type PlanNotice = z.infer<typeof planNoticeSchema>;
export type Notice = z.infer<typeof noticeSchema>;
