// workflows/agent/enclave/profile.ts
import { z } from "zod";

// A sealed profile travels in a log event (CRE delivers at most 5 KB) and sealing adds 49 bytes.
export const MAX_SUBMITTED_BYTES = 4_750;
// The stored state adds a 24-byte nonce and a 16-byte tag and must fit AgentState.MAX_STATE.
export const MAX_STATE_PLAINTEXT = 16_344;

const units = z.string().regex(/^[0-9]{1,30}$/);
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
  })
  .strict()
  .refine((profile) => profile.targetDays >= profile.floorDays);

export type Profile = z.infer<typeof profileSchema>;

const ORDER = [
  "version",
  "taxRateBps",
  "taxBufferBps",
  "payrollShareBps",
  "floorDays",
  "targetDays",
  "dailySpend",
  "payrollDue",
  "salaryOwed",
  "emergencyTarget",
] as const;

export function encodeProfile(profile: Profile): Uint8Array {
  const checked = profileSchema.parse(profile);
  const bytes = new TextEncoder().encode(JSON.stringify(Object.fromEntries(ORDER.map((key) => [key, checked[key]]))));
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
