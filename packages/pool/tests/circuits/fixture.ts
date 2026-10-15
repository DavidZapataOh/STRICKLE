import { authHash, nullifierKey, ownerPk } from "../../src/keys.ts";
import type { Note } from "../../src/note.ts";
import { FREE_POLICY, type Policy, policyHash } from "../../src/policy.ts";

export const SK = 123456789012345678901234567890n;
export const AK = 987654321098765432109876543210n;
export const NOW = 1_800_000_000n;
export const user = { sk: SK, authHash: authHash(SK), nk: nullifierKey(SK), pk: ownerPk(SK) };

let saltCounter = 1000n;
export const freshSalt = (): bigint => ++saltCounter;

export function makeNote(overrides: Partial<Note> = {}, policy: Policy = FREE_POLICY): Note {
  return {
    amount: 1_000_000n,
    ownerPk: user.pk,
    policy: policyHash(policy),
    label: 0n,
    box: "operating",
    asset: "USDC",
    flags: 0,
    lockUntil: 0n,
    salt: freshSalt(),
    ...overrides,
  };
}
