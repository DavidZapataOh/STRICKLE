import { deriveSealKey, parseMaster } from "@strickle/agent/keys";
import { actionDigest, envelopeSchema, requestAad, requestSchema } from "@strickle/agent/signed";
import { open } from "@strickle/prover/sealed";
import { bytesToHex, getAddress, hashTypedData, hexToBytes, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { DEADLINE_SECONDS, nextNonce, sealRequest, signAction, typedDataFor } from "../src/agent/request.ts";

const executor = getAddress("0x00000000000000000000000000000000000000dd");
const vault = getAddress("0x00000000000000000000000000000000000000a1");
const approve = { kind: "approve" as const, proposalId: "salary-2026-11", digest: `0x${"ab".repeat(32)}` as const };
const input = { executor, chainId: 5042002, vault, action: approve, nonce: 1_800_000_000_123n, deadline: 1_800_000_540 };

describe("typedDataFor", () => {
  it("hashes to exactly the digest the enclave verifies", () => {
    const typed = typedDataFor(input);
    expect(hashTypedData({ ...typed, message: typed.message } as never)).toBe(actionDigest(input));
  });

  it("binds the vault, the executor, the chain, the nonce, the deadline and the action", () => {
    const base = actionDigest(input);
    for (const patch of [{ chainId: 1 }, { nonce: 2n }, { deadline: 1 }, { vault: getAddress("0x00000000000000000000000000000000000000a2") }, { executor: getAddress("0x00000000000000000000000000000000000000de") }, { action: { ...approve, proposalId: "other" } }]) {
      const typed = typedDataFor({ ...input, ...patch });
      expect(hashTypedData(typed as never)).not.toBe(base);
    }
  });

  it("carries the nonce and the deadline as bigint, as a signer needs them", () => {
    const typed = typedDataFor(input);
    expect(typeof typed.message.nonce).toBe("bigint");
    expect(typeof typed.message.deadline).toBe("bigint");
  });
});

describe("nextNonce", () => {
  it("is the device clock in milliseconds when it agrees with the chain", () => {
    expect(nextNonce(1_800_000_000, 1_800_000_000_500, null)).toBe(1_800_000_000_500n);
  });

  it("uses chain time when the device clock is off by more than two minutes", () => {
    expect(nextNonce(1_800_000_000, 1_800_003_600_000, null)).toBe(1_800_000_000_000n);
    expect(nextNonce(1_800_000_000, 1_799_990_000_000, null)).toBe(1_800_000_000_000n);
  });

  it("grows with the clock", () => {
    expect(nextNonce(1_800_000_000, 1_800_000_000_501, null)).toBeGreaterThan(nextNonce(1_800_000_000, 1_800_000_000_500, null));
  });

  it("never goes below the last nonce this device sent, even after the clock is corrected", () => {
    const sentWithAFastClock = 1_800_000_110_000n; // 110 seconds ahead, inside the two-minute tolerance
    expect(nextNonce(1_800_000_000, 1_800_003_600_000, sentWithAFastClock)).toBe(sentWithAFastClock + 1n);
    expect(nextNonce(1_800_000_000, 1_800_000_000_500, sentWithAFastClock)).toBe(sentWithAFastClock + 1n);
  });

  it("ignores a last nonce that is behind", () => {
    expect(nextNonce(1_800_000_000, 1_800_000_000_500, 5n)).toBe(1_800_000_000_500n);
  });
});

describe("signAction", () => {
  const owner = privateKeyToAccount(`0x${"01".repeat(32)}`);
  const signer = { signTypedData: (typed: ReturnType<typeof typedDataFor>) => owner.signTypedData(typed as never) };
  const base = { signer, vault, action: approve, executor, chainId: 5042002, chainSeconds: 1_800_000_000, clockMs: 1_800_000_000_250, lastNonce: null };

  it("builds a request the enclave's own schema accepts, with a deadline inside its window", async () => {
    const request = await signAction(base);
    expect(requestSchema.safeParse(request).success).toBe(true);
    expect(request.deadline).toBe(1_800_000_000 + DEADLINE_SECONDS);
    expect(request.nonce).toBe("1800000000250");
    expect(request.vault).toBe(vault);
  });

  it("signs the digest the enclave will recompute", async () => {
    const request = await signAction(base);
    const digest = actionDigest({ executor, chainId: 5042002, vault, action: approve, nonce: BigInt(request.nonce), deadline: request.deadline });
    expect(await recoverAddress({ hash: digest, signature: request.signature as `0x${string}` })).toBe(owner.address);
  });

  it("uses a nonce above the last one sent", async () => {
    const request = await signAction({ ...base, lastNonce: 1_800_000_000_900n });
    expect(request.nonce).toBe("1800000000901");
  });

  it("never asks for a deadline further than the enclave's ten-minute ceiling", () => {
    expect(DEADLINE_SECONDS).toBeLessThanOrEqual(600);
  });
});

describe("sealRequest", () => {
  const key = deriveSealKey(parseMaster(`0x${"11".repeat(32)}`));
  const owner = privateKeyToAccount(`0x${"01".repeat(32)}`);
  const signed = () => signAction({ signer: { signTypedData: (typed) => owner.signTypedData(typed as never) }, vault, action: approve, executor, chainId: 5042002, chainSeconds: 1_800_000_000, clockMs: 1_800_000_000_250, lastNonce: null });

  it("gives the relay an envelope whose only readable part is the vault", async () => {
    const request = await signed();
    const envelope = sealRequest({ request, enclaveKey: bytesToHex(key.publicKey) });
    expect(envelopeSchema.safeParse(envelope).success).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain("approve");
    expect(JSON.stringify(envelope)).not.toContain("salary-2026-11");
    const opened = open(hexToBytes(envelope.sealed), key.secret, key.publicKey, requestAad(vault));
    expect(JSON.parse(new TextDecoder().decode(opened))).toEqual(request);
  });

  it("does not open for another vault", async () => {
    const envelope = sealRequest({ request: await signed(), enclaveKey: bytesToHex(key.publicKey) });
    expect(open(hexToBytes(envelope.sealed), key.secret, key.publicKey, requestAad(getAddress("0x00000000000000000000000000000000000000a2")))).toBeUndefined();
  });

  it("refuses an enclave key that is not 32 bytes", () => {
    expect(() => sealRequest({ request: { vault, action: approve, nonce: "1", deadline: 1, signature: `0x${"11".repeat(65)}` }, enclaveKey: "0x1234" })).toThrow();
  });
});
