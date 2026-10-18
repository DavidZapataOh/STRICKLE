import { encodeRequest } from "./protocol.js";
const toHex = (bytes) => `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
const seconds = () => Math.floor(Date.now() / 1000);
export async function fetchServiceInfo(url, pinnedKey, fetchImpl = fetch) {
    const response = await fetchImpl(`${url}/v1/info`);
    if (!response.ok)
        throw new Error(`prover service answered ${response.status}`);
    const info = (await response.json());
    if (pinnedKey && info.publicKey !== toHex(pinnedKey))
        throw new Error("the service key does not match the pinned key");
    return info;
}
/** Seals the witness to the service key, asks for a proof and checks the answer against what the caller expects. */
export async function proveRemote(args) {
    const request = {
        requestId: toHex(globalThis.crypto.getRandomValues(new Uint8Array(32))).slice(2),
        issuedAt: (args.now ?? seconds)(),
        circuit: args.circuit,
        inputs: args.inputs,
    };
    const response = await (args.fetch ?? fetch)(`${args.url}/v1/prove`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${args.token}` },
        body: JSON.stringify(encodeRequest(request, args.publicKey)),
    });
    if (!response.ok)
        throw new Error(`prover service answered ${response.status}`);
    const answer = (await response.json());
    if (args.expectedPublicInputs) {
        const got = answer.publicInputs.map((value) => BigInt(value));
        const same = got.length === args.expectedPublicInputs.length && got.every((value, i) => value === args.expectedPublicInputs?.[i]);
        if (!same)
            throw new Error("the service returned different public inputs than the witness implies");
    }
    return answer;
}
