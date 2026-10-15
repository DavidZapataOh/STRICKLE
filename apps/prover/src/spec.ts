// apps/prover/src/spec.ts
import type { InputMap } from "@noir-lang/noir_js";
import type { PoolLedger } from "@strickle/pool/ledger";
import { noteCommitment } from "@strickle/pool/note";
import { specFromWire } from "@strickle/pool/spec-wire";
import { buildSpendInputs } from "@strickle/pool/witness";

export interface SpecResolver {
  inputsFor(wire: unknown): Promise<InputMap>;
  leaf(commitment: bigint): Promise<number | undefined>;
  size(): number;
}

export function createSpecResolver(options: { sync: () => Promise<unknown>; ledger: PoolLedger }): SpecResolver {
  return {
    async inputsFor(wire) {
      await options.sync();
      const spec = specFromWire(wire, options.ledger.tree);
      for (const input of spec.inputs) {
        if (input && options.ledger.find(noteCommitment(input.note)) !== input.leafIndex) throw new Error("the input note is not in the ledger at that leaf");
      }
      return buildSpendInputs(spec).inputs;
    },
    async leaf(commitment) {
      await options.sync();
      return options.ledger.find(commitment);
    },
    size: () => options.ledger.size,
  };
}
