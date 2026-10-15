import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { type ProveBody, encodeRequestWith } from "@strickle/prover/protocol";
import { scalarFrom } from "@strickle/prover/sealed";
import { type Address, type Hex, bytesToHex } from "viem";

/**
 * The request id and the ephemeral key are derived from the request's own content (and the master), never from the spend's identity alone:
 * the same signed request can be tried again with another `issuedAt` or a freshly resolved leaf, and two different plaintexts must never share a key.
 */
export function proveBody(master: Uint8Array, vault: Address, inputs: unknown, serverKey: Uint8Array, issuedAt: number): ProveBody {
  const utf8 = (value: string) => new TextEncoder().encode(value);
  const requestId = bytesToHex(sha256(utf8(JSON.stringify({ vault, issuedAt, inputs })))).slice(2);
  const request = { requestId, issuedAt, circuit: "spend_spec", inputs };
  const ephemeral = scalarFrom(hkdf(sha256, master, sha256(utf8(JSON.stringify(request))), utf8("strickle/private/request-esk/v2"), 64));
  return encodeRequestWith(request, serverKey, ephemeral);
}

export function parseProveAnswer(body: string): { proof: Hex; publicInputs: bigint[] } {
  try {
    const answer = JSON.parse(body) as { proof?: unknown; publicInputs?: unknown };
    if (typeof answer.proof !== "string" || !/^0x[0-9a-f]+$/.test(answer.proof) || answer.proof.length < 4 || !Array.isArray(answer.publicInputs) || answer.publicInputs.length === 0) throw new Error();
    return { proof: answer.proof as Hex, publicInputs: answer.publicInputs.map((value) => BigInt(value as string)) };
  } catch {
    throw new Error("prover error");
  }
}
