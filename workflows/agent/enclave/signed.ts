// workflows/agent/enclave/signed.ts
import { type Address, type Hex, concat, encodeFunctionData, getAddress, hashTypedData, hexToBytes, keccak256, pad, parseAbi, toBytes, toHex } from "viem";
import { z } from "zod";
import { type RpcRequest, callRequest } from "./rpc.ts";

const units = z.string().regex(/^[0-9]{1,30}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash32 = z.string().regex(/^0x[0-9a-f]{64}$/);

export const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pause") }).strict(),
  z.object({ kind: z.literal("resume") }).strict(),
  z.object({ kind: z.literal("approve"), proposalId: z.string().max(24), digest: hash32 }).strict(),
  z.object({ kind: z.literal("reject"), proposalId: z.string().max(24) }).strict(),
  z
    .object({
      kind: z.literal("adjust"),
      changes: z
        .object({
          salaryProposed: units.optional(),
          salaryDay: z.number().int().min(1).max(28).optional(),
          payee: address.optional(),
          dailyCap: units.optional(),
          signatureThreshold: units.optional(),
          floorDays: z.number().int().optional(),
          targetDays: z.number().int().optional(),
        })
        .strict()
        .refine((changes) => Object.keys(changes).length > 0),
    })
    .strict(),
]);

export type Action = z.infer<typeof actionSchema>;

export const requestSchema = z
  .object({ vault: address, action: actionSchema, nonce: units, deadline: z.number().int().min(0), signature: z.string().regex(/^0x([0-9a-fA-F]{2}){65,2048}$/) })
  .strict();

export type SignedRequest = z.infer<typeof requestSchema>;

// The HTTP trigger runs on the Workflow DON, in the clear, so the gateway and the DON only ever see this envelope.
export const envelopeSchema = z.object({ vault: address, sealed: z.string().regex(/^0x([0-9a-fA-F]{2}){49,8192}$/) }).strict();

export const requestAad = (vault: Address): Uint8Array => new TextEncoder().encode(`strickle/request/v1:${vault.toLowerCase()}`);

const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, inner]) => [key, sorted(inner)]))
      : value;

export const actionHash = (action: Action): Hex => keccak256(toBytes(JSON.stringify(sorted(action))));

const TYPES = { Action: [{ name: "vault", type: "address" }, { name: "actionHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] } as const;

export const actionDigest = (input: { executor: Address; chainId: number; vault: Address; action: Action; nonce: bigint; deadline: number }): Hex =>
  hashTypedData({
    domain: { name: "Strickle Agent", version: "1", chainId: input.chainId, verifyingContract: input.executor },
    types: TYPES,
    primaryType: "Action",
    message: { vault: input.vault, actionHash: actionHash(input.action), nonce: input.nonce, deadline: BigInt(input.deadline) },
  });

const erc1271Abi = parseAbi(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"]);
const PRECOMPILE = "0x0000000000000000000000000000000000000001" as const;
const MAGIC = "0x1626ba7e";

export function ecrecoverRequest(digest: Hex, signature: Hex): RpcRequest {
  const bytes = hexToBytes(signature);
  if (bytes.length !== 65) throw new Error("bad signature");
  const v = bytes[64] < 27 ? bytes[64] + 27 : bytes[64];
  const data = concat([digest, pad(toHex(v), { size: 32 }), toHex(bytes.slice(0, 32)), toHex(bytes.slice(32, 64))]);
  return callRequest(PRECOMPILE, data, "latest");
}

export function recoveredSigner(result: unknown): Address | undefined {
  if (typeof result !== "string" || result.length !== 66) return undefined;
  const word = result.slice(2);
  return /^0+$/.test(word) ? undefined : getAddress(`0x${word.slice(24)}`);
}

export const erc1271Request = (owner: Address, digest: Hex, signature: Hex): RpcRequest =>
  callRequest(owner, encodeFunctionData({ abi: erc1271Abi, functionName: "isValidSignature", args: [digest, signature] }), "latest");

export const erc1271Accepts = (result: unknown): boolean => typeof result === "string" && result.toLowerCase().startsWith(MAGIC);
