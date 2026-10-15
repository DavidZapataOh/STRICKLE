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
    salary: z
      .object({ proposed: units, pending: units, payee: address, day: bps(1, 28), lastPaid: z.string().regex(/^(\d{4}-\d{2})?$/) })
      .strict()
      .default({ proposed: "0", pending: "0", payee: ZERO_ADDRESS, day: 1, lastPaid: "" }),
    limits: z.object({ dailyCap: units, signatureThreshold: units }).strict().default({ dailyCap: "0", signatureThreshold: "0" }),
    history: z.array(z.tuple([date, signed, z.string().max(24)])).max(200).default([]),
    payrolls: z.array(z.tuple([date, units])).max(24).default([]),
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
