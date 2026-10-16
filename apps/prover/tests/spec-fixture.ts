// apps/prover/tests/spec-fixture.ts
import { AGENT_ACTION } from "@strickle/pool/constants";
import { agentKeyHash, ownerPkFrom } from "@strickle/pool/keys";
import { PoolLedger } from "@strickle/pool/ledger";
import { MerkleTree } from "@strickle/pool/merkle";
import { type Note, noteCommitment } from "@strickle/pool/note";
import { FREE_POLICY, type Policy, policyHash } from "@strickle/pool/policy";
import { addressToField } from "@strickle/pool/pool-client";
import type { LiteSpec } from "@strickle/pool/spec-wire";
import { recipientLeaf } from "@strickle/pool/witness";

export const PAYEE = "0x00000000000000000000000000000000000000b2" as const;
const AK = 99n;
const NK = 2n;
const AUTH = 3n;

export function liteSpec() {
  const allowlist = new MerkleTree(10);
  allowlist.insert(recipientLeaf(addressToField(PAYEE)));
  const policy: Policy = { ...FREE_POLICY, restricted: true, allowlistRoot: allowlist.root, agentKeyHash: agentKeyHash(AK), agentActions: AGENT_ACTION.PAY_ALLOWLISTED, agentCap: 600_000n };
  const make = (amount: bigint, salt: bigint): Note => ({ amount, ownerPk: ownerPkFrom(AUTH, NK), policy: policyHash(policy), label: 1n, box: "payroll", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt });
  const input = make(1_000_000n, 3n);
  const ledger = new PoolLedger();
  ledger.append(noteCommitment(input), 0n);
  const lite: LiteSpec = {
    inputs: [{ note: input, policy, leafIndex: 0 }, null],
    outputs: [{ note: make(700_000n, 0n) }, { note: { ...make(0n, 9n), ownerPk: 5n, label: 0n } }],
    signer: { kind: "agent", ak: AK, nk: NK, authHash: AUTH },
    publicAmount: 300_000n,
    recipient: addressToField(PAYEE),
    asset: "USDC",
    now: 1_800_000_000n,
    ciphertextHash: 123n,
    allowlist: { addresses: [PAYEE], index: 0 },
    dummyNk: [11n, 12n],
    dummySalt: [13n, 14n],
    enc: [0n, 22n],
  };
  return { ledger, lite, input, tree: ledger.tree, allowlist };
}
