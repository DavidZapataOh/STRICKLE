// workflows/agent/tests/signed.test.ts
import { type Hex, getAddress, hashTypedData, recoverAddress, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { open, seal } from "@strickle/prover/sealed";
import { deriveSealKey, parseMaster } from "../enclave/keys.ts";
import { decodeOwner } from "../enclave/rpc.ts";
import { actionDigest, actionHash, actionSchema, ecrecoverRequest, envelopeSchema, erc1271Accepts, erc1271Request, recoveredSigner, requestAad, requestSchema } from "../enclave/signed.ts";

const executor = getAddress("0x00000000000000000000000000000000000000dd");
const vault = getAddress("0x00000000000000000000000000000000000000a1");
const approve = { kind: "approve" as const, proposalId: "salary-2026-11", digest: `0x${"ab".repeat(32)}` as Hex };
const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
const input = { executor, chainId: 5042002, vault, action: approve, nonce: 3n, deadline: 1_800_000_300 };

describe("actionDigest", () => {
  it("is the EIP-712 hash of the action, bound to chain, executor, vault, nonce and deadline", () => {
    const expected = hashTypedData({
      domain: { name: "Strickle Agent", version: "1", chainId: 5042002, verifyingContract: executor },
      types: { Action: [{ name: "vault", type: "address" }, { name: "actionHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
      primaryType: "Action",
      message: { vault, actionHash: actionHash(approve), nonce: 3n, deadline: 1_800_000_300n },
    });
    expect(actionDigest(input)).toBe(expected);
  });

  it.each([
    ["the chain", { chainId: 1 }],
    ["the executor", { executor: getAddress("0x00000000000000000000000000000000000000de") }],
    ["the vault", { vault: getAddress("0x00000000000000000000000000000000000000a2") }],
    ["the nonce", { nonce: 4n }],
    ["the deadline", { deadline: 1_800_000_301 }],
    ["the action", { action: { ...approve, proposalId: "salary-2026-12" } }],
  ])("changes with %s", (_name, patch) => {
    expect(actionDigest({ ...input, ...patch })).not.toBe(actionDigest(input));
  });

  it("hashes an action the same whatever the key order", () => {
    expect(actionHash({ digest: approve.digest, proposalId: approve.proposalId, kind: "approve" })).toBe(actionHash(approve));
  });
});

describe("requests", () => {
  const request = { vault, action: { kind: "pause" }, nonce: "1", deadline: 1_800_000_300, signature: `0x${"11".repeat(65)}` };

  it("accepts a well-formed request, including the longer signatures smart accounts produce", () => {
    expect(requestSchema.safeParse(request).success).toBe(true);
    expect(requestSchema.safeParse({ ...request, signature: `0x${"22".repeat(300)}` }).success).toBe(true);
  });

  it.each([
    ["an unknown action", { action: { kind: "withdraw" } }],
    ["an adjust with no change", { action: { kind: "adjust", changes: {} } }],
    ["an adjust with a salary day of 31", { action: { kind: "adjust", changes: { salaryDay: 31 } } }],
    ["a short signature", { signature: "0x1234" }],
    ["a signature longer than 2 KB", { signature: `0x${"11".repeat(2049)}` }],
    ["an extra field", { extra: 1 }],
    ["a non-numeric nonce", { nonce: "-1" }],
  ])("refuses %s", (_name, patch) => {
    expect(requestSchema.safeParse({ ...request, ...patch }).success).toBe(false);
  });

  it("parses every action kind", () => {
    for (const action of [{ kind: "pause" }, { kind: "resume" }, approve, { kind: "reject", proposalId: "x" }, { kind: "adjust", changes: { floorDays: 14 } }]) {
      expect(actionSchema.safeParse(action).success).toBe(true);
    }
  });
});

describe("the envelope the gateway carries", () => {
  const key = deriveSealKey(parseMaster(`0x${"11".repeat(32)}`));
  const inner = new TextEncoder().encode(JSON.stringify({ vault, action: { kind: "pause" }, nonce: "1", deadline: 1, signature: `0x${"11".repeat(65)}` }));

  it("accepts only a vault and an opaque blob", () => {
    expect(envelopeSchema.safeParse({ vault, sealed: `0x${"ab".repeat(80)}` }).success).toBe(true);
    expect(envelopeSchema.safeParse({ vault, sealed: `0x${"ab".repeat(80)}`, action: { kind: "pause" } }).success).toBe(false);
    expect(envelopeSchema.safeParse({ vault, sealed: "0x12" }).success).toBe(false);
  });

  it("opens for the enclave key and only under the vault it was sealed for", () => {
    const sealed = seal(inner, key.publicKey, requestAad(vault));
    expect(open(sealed, key.secret, key.publicKey, requestAad(vault))).toEqual(inner);
    expect(open(sealed, key.secret, key.publicKey, requestAad(getAddress("0x00000000000000000000000000000000000000a2")))).toBeUndefined();
  });

  it("keeps the action out of the clear", () => {
    const sealed = seal(inner, key.publicKey, requestAad(vault));
    expect(Buffer.from(sealed).toString("latin1")).not.toContain("pause");
  });
});

describe("signature checks over RPC", () => {
  it("builds the ecrecover precompile call from the digest and the signature", async () => {
    const digest = actionDigest(input);
    const signature = await account.sign({ hash: digest });
    const request = ecrecoverRequest(digest, signature);
    const call = request.params[0] as { to: string; data: Hex };
    expect(call.to).toBe("0x0000000000000000000000000000000000000001");
    expect(call.data).toHaveLength(2 + 128 * 2);
    expect(call.data.slice(2, 66)).toBe(digest.slice(2));
    expect(BigInt(`0x${call.data.slice(66, 130)}`)).toBeOneOf([27n, 28n]);
    expect(await recoverAddress({ hash: digest, signature })).toBe(account.address);
  });

  it("normalises a recovery id of 0 or 1 to 27 or 28 and refuses a bad length", async () => {
    const digest = actionDigest(input);
    const signature = await account.sign({ hash: digest });
    const zeroBased = `${signature.slice(0, 130)}${(Number.parseInt(signature.slice(130), 16) - 27).toString(16).padStart(2, "0")}` as Hex;
    expect(ecrecoverRequest(digest, zeroBased)).toEqual(ecrecoverRequest(digest, signature));
    expect(() => ecrecoverRequest(digest, "0x1234")).toThrow();
  });

  it("reads the signer from the precompile's answer", () => {
    expect(recoveredSigner(`0x${"0".repeat(24)}${account.address.slice(2).toLowerCase()}`)).toBe(account.address);
    expect(recoveredSigner("0x")).toBeUndefined();
    expect(recoveredSigner(`0x${"0".repeat(64)}`)).toBeUndefined();
  });

  it("builds an ERC-1271 call and recognises only the magic value", () => {
    const digest = actionDigest(input);
    const request = erc1271Request(account.address, digest, toHex(new Uint8Array(65).fill(1)));
    expect((request.params[0] as { to: string }).to).toBe(account.address);
    expect(erc1271Accepts(`0x1626ba7e${"0".repeat(56)}`)).toBe(true);
    expect(erc1271Accepts(`0xffffffff${"0".repeat(56)}`)).toBe(false);
    expect(erc1271Accepts("0x")).toBe(false);
  });

  it("reads the vault owner", () => {
    expect(decodeOwner(`0x${"0".repeat(24)}${account.address.slice(2).toLowerCase()}`)).toBe(account.address);
  });
});
