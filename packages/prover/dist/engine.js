import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
/** 131,072 points (4 MiB compressed) cover every circuit up to 2^16 gates; bb.js defaults to four times that. */
export const SRS_SIZE = 131_072;
/** The same engine runs in Node and in the browser; circuits and the Barretenberg instance are created once, on demand. */
export function createProver(options) {
    let api;
    let circuits = new Map();
    let backends = new Map();
    const circuit = (name) => {
        let loaded = circuits.get(name);
        if (!loaded) {
            loaded = Promise.resolve(options.loadCircuit(name));
            circuits.set(name, loaded);
            loaded.catch(() => circuits.delete(name));
        }
        return loaded;
    };
    const backend = (name) => {
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
        async prepare(name) {
            await backend(name);
        },
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
            if (!(await this.verify(name, proof)))
                throw new Error(`${name}: the fresh proof does not verify`);
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
