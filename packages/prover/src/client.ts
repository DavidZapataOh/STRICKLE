import { type ProveRequest, encodeRequest } from "./protocol.ts";

export interface ServiceInfo {
  version: string;
  publicKey: string;
  circuits: string[];
  maxBody: number;
  maxQueue: number;
}

const toHex = (bytes: Uint8Array): string => `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
const seconds = (): number => Math.floor(Date.now() / 1000);

export async function fetchServiceInfo(url: string, pinnedKey?: Uint8Array, fetchImpl: typeof fetch = fetch): Promise<ServiceInfo> {
  const response = await fetchImpl(`${url}/v1/info`);
  if (!response.ok) throw new Error(`prover service answered ${response.status}`);
  const info = (await response.json()) as ServiceInfo;
  if (pinnedKey && info.publicKey !== toHex(pinnedKey)) throw new Error("the service key does not match the pinned key");
  return info;
}

export interface RemoteProveArgs {
  url: string;
  token: string;
  /** The service key the caller pinned out of band; the witness is sealed to it. */
  publicKey: Uint8Array;
  circuit: string;
  inputs: unknown;
  /** If given, the answer must carry exactly these public inputs. */
  expectedPublicInputs?: bigint[];
  /** Unix seconds. */
  now?: () => number;
  fetch?: typeof fetch;
}

/** Seals the witness to the service key, asks for a proof and checks the answer against what the caller expects. */
export async function proveRemote(args: RemoteProveArgs): Promise<{ proof: string; publicInputs: string[] }> {
  const request: ProveRequest = {
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
  if (!response.ok) throw new Error(`prover service answered ${response.status}`);
  const answer = (await response.json()) as { proof: string; publicInputs: string[] };
  if (args.expectedPublicInputs) {
    const got = answer.publicInputs.map((value) => BigInt(value));
    const same = got.length === args.expectedPublicInputs.length && got.every((value, i) => value === args.expectedPublicInputs?.[i]);
    if (!same) throw new Error("the service returned different public inputs than the witness implies");
  }
  return answer;
}
