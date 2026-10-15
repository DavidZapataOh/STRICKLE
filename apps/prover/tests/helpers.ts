import { type Note, noteCommitment } from "@strickle/pool/note";
import { MerkleTree } from "@strickle/pool/merkle";
import { FREE_POLICY, policyHash } from "@strickle/pool/policy";
import { authHash, nullifierKey, ownerPk } from "@strickle/pool/keys";
import { buildShieldInputs, buildSpendInputs } from "@strickle/pool/witness";
import { createHash } from "node:crypto";

export const SECRET = 424242424242424242424242424242n;
export const TOKEN = "service-test-token-0123456789abcdef";
export const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");

export const note = (overrides: Partial<Note> = {}): Note => ({
  amount: 1_000_000n,
  ownerPk: ownerPk(SECRET),
  policy: policyHash(FREE_POLICY),
  label: 0n,
  box: "operating",
  asset: "USDC",
  flags: 0,
  lockUntil: 0n,
  salt: 7_000_000_000_000_000_000_000_001n,
  ...overrides,
});

export const shieldWitness = (overrides: Partial<Note> = {}) => buildShieldInputs({ note: note(overrides) });

export function spendWitness() {
  const tree = new MerkleTree();
  const input = note();
  const index = tree.insertPair(noteCommitment(input), noteCommitment(note({ amount: 0n, ownerPk: 1n, salt: 2n }))).index;
  return buildSpendInputs({
    tree,
    inputs: [{ note: input, policy: FREE_POLICY, leafIndex: index }, null],
    outputs: [{ note: note({ amount: 600_000n, box: "salary" }) }, { note: note({ amount: 400_000n, box: "profit" }) }],
    signer: { kind: "user", sk: SECRET },
    now: 1_800_000_000n,
  });
}

export const keys = { auth: authHash(SECRET), nk: nullifierKey(SECRET) };
