// packages/pool/tests/crypto/envelope-deterministic.test.ts
import { describe, expect, it } from "vitest";
import { FREE_POLICY, policyHash } from "../../src/policy.ts";
import { openSection, sealEnvelope, sealEnvelopeWith } from "../../src/crypto/envelope.ts";
import { generateViewKey } from "../../src/crypto/keys.ts";
import type { Note } from "../../src/note.ts";

const owner = generateViewKey();
const note: Note = { amount: 400n, ownerPk: 7n, policy: policyHash(FREE_POLICY), label: 1n, box: "operating", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt: 5n };
const output = { note, policy: FREE_POLICY, viewers: [{ tier: "owner" as const, publicKey: owner.publicKey }] };

describe("sealEnvelopeWith", () => {
  const seed = Uint8Array.from({ length: 64 }, (_, i) => i);

  it("is deterministic for a seed and different across seeds", () => {
    const a = sealEnvelopeWith([output, null], seed);
    expect(sealEnvelopeWith([output, null], seed)).toBe(a);
    expect(sealEnvelopeWith([output, null], seed.map((b) => b ^ 1))).not.toBe(a);
  });

  it("opens for the owner exactly like a randomly sealed envelope", () => {
    const envelope = sealEnvelopeWith([output, null], seed);
    expect(openSection(envelope, 0, "owner", { publicKey: owner.publicKey, secret: owner.secret })).toBeDefined();
  });

  it("keeps sealEnvelope random", () => {
    expect(sealEnvelope([output, null])).not.toBe(sealEnvelope([output, null]));
  });
});
