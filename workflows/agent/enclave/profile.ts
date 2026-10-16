import { z } from "zod";

// A sealed profile travels in a log event (CRE delivers at most 5 KB; sealing adds 49 bytes); the stored state may be larger.
export const MAX_SUBMITTED_BYTES = 4_750;
export const MAX_STATE_PLAINTEXT = 16_344;
export const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

const units = z.string().regex(/^[0-9]{1,30}$/);
const signed = z.string().regex(/^-?[0-9]{1,30}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const maybeDate = z.union([date, z.literal("")]);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const dec = z.string().regex(/^[0-9]{1,80}$/);
const wireNote = z.object({ amount: dec, ownerPk: dec, policy: dec, label: dec, box: z.enum(["taxes", "payroll", "salary", "operating", "emergency", "profit"]), asset: z.enum(["USDC", "EURC"]), flags: z.number().int().min(0).max(1), lockUntil: dec, delayFloor: z.number().int().min(0), salt: dec }).strict();
const wirePolicy = z.object({ floor: dec, allowlistRoot: dec, restricted: z.boolean(), agentKeyHash: dec, agentCap: dec, agentActions: z.number().int().min(0).max(15), releaseDelay: z.number().int().min(0), templateRoot: dec }).strict();
export const ZERO_KEY = `0x${"0".repeat(64)}`;
const hash32 = z.string().regex(/^0x[0-9a-f]{64}$/);
const proposalSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,24}$/),
    kind: z.literal("salary-day-one"),
    amount: units,
    payee: address,
    digest: hash32,
    createdAt: z.number().int().min(0),
    expiresAt: z.number().int().min(0),
    status: z.enum(["pending", "approved", "rejected", "expired", "executed"]),
    decidedAt: z.number().int().min(0).default(0),
  })
  .strict();
const bps = (min: number, max: number) => z.number().int().min(min).max(max);

export const profileSchema = z
  .object({
    version: z.literal(1),
    taxRateBps: bps(0, 10_000),
    taxBufferBps: bps(10_500, 11_000),
    payrollShareBps: bps(0, 10_000),
    floorDays: bps(0, 365),
    targetDays: bps(0, 365),
    dailySpend: units,
    payrollDue: units,
    salaryOwed: units,
    emergencyTarget: units,
    taxesDue: units.default("0"),
    nonce: units.default("0"),
    userKey: hash32.default(ZERO_KEY),
    proposals: z.array(proposalSchema).max(8).default([]),
    privateMode: z
      .object({
        enabled: z.boolean(),
        ak: dec, nk: dec, authHash: dec, ownerPk: dec,
        viewers: z.array(z.object({ tier: z.enum(["owner", "accountant", "authority"]), publicKey: hash32 }).strict()).max(3),
        notes: z.array(z.object({ note: wireNote, policy: wirePolicy, allowlist: z.array(address).max(8), leafIndex: z.number().int().min(0).nullable() }).strict()).max(6),
      })
      .strict()
      .default({ enabled: false, ak: "0", nk: "0", authHash: "0", ownerPk: "0", viewers: [], notes: [] }),
    salary: z
      .object({ proposed: units, pending: units, payee: address, day: bps(1, 28), lastPaid: z.string().regex(/^(\d{4}-\d{2})?$/) })
      .strict()
      .default({ proposed: "0", pending: "0", payee: ZERO_ADDRESS, day: 1, lastPaid: "" }),
    limits: z.object({ dailyCap: units, signatureThreshold: units }).strict().default({ dailyCap: "0", signatureThreshold: "0" }),
    history: z.array(z.tuple([date, signed, z.string().max(24)])).max(200).default([]),
    payrolls: z.array(z.tuple([date, units])).max(24).default([]),
    taxDates: z.array(date).max(12).default([]),
    clockOffsetDays: z.number().int().min(-3650).max(3650).default(0),
    tick: z.object({ lastDay: maybeDate, p10: signed, p50: signed }).strict().default({ lastDay: "", p10: "0", p50: "0" }),
    breaker: z
      .object({ halted: z.boolean(), since: maybeDate, codes: z.array(z.string().max(24)).max(7) })
      .strict()
      .default({ halted: false, since: "", codes: [] }),
  })
  .strict()
  .refine((profile) => profile.targetDays >= profile.floorDays);

export type Profile = z.infer<typeof profileSchema>;

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([key, inner]) => [key, canonical(inner)]),
        )
      : value;

export function encodeProfile(profile: Profile): Uint8Array {
  // The oldest history entries go first when the state would not fit: a vault must never get stuck because its history grew.
  let current = profileSchema.parse(profile);
  let bytes = new TextEncoder().encode(JSON.stringify(canonical(current)));
  while (bytes.length > MAX_STATE_PLAINTEXT && current.history.length > 0) {
    current = { ...current, history: current.history.slice(1) };
    bytes = new TextEncoder().encode(JSON.stringify(canonical(current)));
  }
  if (bytes.length > MAX_STATE_PLAINTEXT) throw new Error("profile is too large");
  return bytes;
}

export function decodeProfile(bytes: Uint8Array): Profile {
  try {
    return profileSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new Error("profile is not valid");
  }
}

export function mergeProfile(existing: Profile | undefined, submitted: Profile): Profile {
  if (!existing) return submitted;
  return {
    ...submitted,
    history: existing.history.length > 0 ? existing.history : submitted.history,
    tick: existing.tick,
    nonce: BigInt(existing.nonce) > BigInt(submitted.nonce) ? existing.nonce : submitted.nonce,
    proposals: existing.proposals,
    privateMode: { ...submitted.privateMode, notes: existing.privateMode.notes.length > 0 ? existing.privateMode.notes : submitted.privateMode.notes },
    breaker: existing.breaker,
    // Until the agent has ticked once, or when the owner changes the salary, the funding target is still the owner's.
    salaryOwed: existing.tick.lastDay === "" || existing.salary.proposed !== submitted.salary.proposed ? submitted.salaryOwed : existing.salaryOwed,
    salary: { ...submitted.salary, pending: existing.salary.pending, lastPaid: existing.salary.lastPaid },
  };
}
