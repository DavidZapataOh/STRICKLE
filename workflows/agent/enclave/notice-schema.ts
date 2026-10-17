import { z } from "zod";

const units = z.string().regex(/^[0-9]{1,30}$/);
const signed = z.string().regex(/^-?[0-9]{1,30}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash32 = z.string().regex(/^0x[0-9a-f]{64}$/);

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
    rates: z.object({ taxBps: z.number().int().min(0).max(10_000) }).strict(),
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
  planNoticeSchema,
]);

export type PlanNotice = z.infer<typeof planNoticeSchema>;
export type Notice = z.infer<typeof noticeSchema>;
