# @strickle/pool

The client of a shielded pool on Arc whose notes carry their own rules: each note holds a box (operating, salary, taxes, profit), a policy hash and a lock, and the zero-knowledge circuit refuses a spend that breaks the policy of the notes it consumes.

## What it does

- Notes and commitments over Poseidon2 (`noteCommitment`, `noteNullifier`), a Merkle tree for the pool's ledger and the keys of a pool account.
- The policy a note carries (`Policy`: floor, allowlist root, agent key hash and cap, release delay, template root) and its hash (`policyHash`).
- Witness builders for the two circuits, `shield` and `spend`, and a prover that runs them in Node (`@strickle/pool/prove`) with the compiled circuits shipped in the package.
- Encrypted delivery of a note to its recipient, scanning, and recovery of an account from the pool's events.

## Install

```sh
npm install ./strickle-core-0.1.0.tgz ./strickle-prover-0.1.0.tgz ./strickle-pool-0.1.0.tgz
```

The tarballs come from `npm run kits:pack -- @strickle/pool` in the repository. Node 24 or newer. The proving system may fetch its reference string from its public host on first use.

## Example

The file `examples/pool.mjs` is this code:

```js
import { FREE_POLICY, noteCommitment, policyHash } from "@strickle/pool";
import { closeProver, executeCircuit, proveCircuit, verifyCircuit } from "@strickle/pool/prove";
import { buildShieldInputs } from "@strickle/pool/witness";

const note = {
  amount: 5_000_000n,
  ownerPk: 42n,
  policy: policyHash(FREE_POLICY),
  label: 9n,
  box: "operating",
  asset: "USDC",
  flags: 0,
  lockUntil: 0n,
  delayFloor: 0,
  salt: 1001n,
};
try {
  const built = buildShieldInputs({ note });
  const { witness } = await executeCircuit("shield", built.inputs);
  const proof = await proveCircuit("shield", witness);
  const valid = await verifyCircuit("shield", proof);
  const tampered = await verifyCircuit("shield", { ...proof, publicInputs: [...proof.publicInputs.slice(0, 1), `0x${"01".padStart(64, "0")}`, ...proof.publicInputs.slice(2)] });
  console.log(`commitment ${noteCommitment(note).toString(16).slice(0, 16)}…, proof verifies: ${valid}, altered public input verifies: ${tampered}`);
  if (!valid || tampered) throw new Error("unexpected proof result");
  console.log("ok");
} finally {
  await closeProver();
}
```

## What it does not do

- The pool contracts and the verifiers are in the repository's `contracts/` folder; this package does not deploy them. The contracts are unaudited.
- It does not hold keys for you. The caller supplies and stores every secret.
- It does not hide who pays into the pool or when; it hides amounts, owners and which note a spend consumes.

## Tested on

The unit and property tests in `tests/` cover the cryptography and the witnesses; `tests/circuits` proves and verifies real shield and spend proofs with the compiled circuits; `npm run live -w @strickle/pool` runs a shield, a spend and a withdrawal against the pool deployed on Arc testnet.
