import { type BackendOptions, Barretenberg, type ProofData, UltraHonkBackend } from "@aztec/bb.js";
import { type CompiledCircuit, type InputMap, Noir } from "@noir-lang/noir_js";

/** 131,072 points (4 MiB compressed) cover every circuit up to 2^16 gates; bb.js defaults to four times that. */
export const SRS_SIZE = 131_072;

export interface ProverOptions {
  loadCircuit(name: string): Promise<CompiledCircuit> | CompiledCircuit;
  backend?: BackendOptions;
}

export interface Prover {
  execute(name: string, inputs: InputMap): Promise<{ witness: Uint8Array }>;
  prove(name: string, witness: Uint8Array): Promise<ProofData>;
  verify(name: string, proof: ProofData): Promise<boolean>;
  /** Executes, proves, verifies and returns; throws if the proof does not verify. */
  proveInputs(name: string, inputs: InputMap): Promise<{ proof: Uint8Array; publicInputs: string[] }>;
  destroy(): Promise<void>;
}

/** The same engine runs in Node and in the browser; circuits and the Barretenberg instance are created once, on demand. */
export function createProver(options: ProverOptions): Prover {
  let api: Promise<Barretenberg> | undefined;
  let circuits = new Map<string, Promise<CompiledCircuit>>();
  let backends = new Map<string, Promise<UltraHonkBackend>>();

  const circuit = (name: string): Promise<CompiledCircuit> => {
    let loaded = circuits.get(name);
    if (!loaded) {
      loaded = Promise.resolve(options.loadCircuit(name));
      circuits.set(name, loaded);
      loaded.catch(() => circuits.delete(name));
    }
    return loaded;
  };

  const backend = (name: string): Promise<UltraHonkBackend> => {
    let ready = backends.get(name);
    if (!ready) {
      ready = (async () => {
        const [artifact, instance] = await Promise.all([circuit(name), (api ??= Barretenberg.new({ srsSize: SRS_SIZE, ...options.backend }))]);
        return new UltraHonkBackend(artifact.bytecode, instance);
      })();
      backends.set(name, ready);
      ready.catch(() => backends.delete(name));
    }
    return ready;
  };

  return {
    async execute(name, inputs) {
      const { witness } = await new Noir(await circuit(name)).execute(inputs);
      return { witness };
    },
    async prove(name, witness) {
      return (await backend(name)).generateProof(witness, { verifierTarget: "evm" });
    },
    async verify(name, proof) {
      return (await backend(name)).verifyProof(proof, { verifierTarget: "evm" });
    },
    async proveInputs(name, inputs) {
      const { witness } = await this.execute(name, inputs);
      const proof = await this.prove(name, witness);
      if (!(await this.verify(name, proof))) throw new Error(`${name}: the fresh proof does not verify`);
      return { proof: proof.proof, publicInputs: proof.publicInputs };
    },
    async destroy() {
      const instance = api;
      api = undefined;
      circuits = new Map();
      backends = new Map();
      await (await instance)?.destroy();
    },
  };
}
