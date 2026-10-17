import { type Profile, profileSchema } from "../enclave/profile.ts";

const valid = {
  version: 1 as const,
  taxRateBps: 2_000,
  taxBufferBps: 10_500,
  payrollShareBps: 10_000,
  floorDays: 14,
  targetDays: 42,
  dailySpend: "40000000",
  payrollDue: "0",
  salaryOwed: "1500000000",
  emergencyTarget: "9000000000",
};

/** A valid sealed profile with the fields a test cares about replaced. */
export const profileOf = (over: Partial<Profile> = {}): Profile => profileSchema.parse({ ...valid, ...over });
