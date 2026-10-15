import { describe, expect, it } from "vitest";
import { generateViewKey } from "../../src/crypto/keys.ts";
import { sealEnvelope } from "../../src/crypto/envelope.ts";
import { openOwnerNote } from "../../src/crypto/scan.ts";
import { type Note, noteCommitment } from "../../src/note.ts";
import { FREE_POLICY, policyHash } from "../../src/policy.ts";

const note: Note = { amount: 77n, ownerPk: 5n, policy: policyHash(FREE_POLICY), label: 0n, box: "profit", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt: 99n };

describe("owner scan", () => {
  it("opens an envelope whose plaintext matches the on-chain commitment", () => {
    const owner = generateViewKey();
    const envelope = sealEnvelope([{ note, policy: FREE_POLICY, viewers: [{ tier: "owner", publicKey: owner.publicKey }] }, null]);
    expect(openOwnerNote(envelope, 0, owner, noteCommitment(note))).toEqual({ note, policy: FREE_POLICY });
  });

  it("rejects a plaintext that does not open the commitment (a poisoned envelope)", () => {
    const owner = generateViewKey();
    const forged: Note = { ...note, amount: 78n };
    const envelope = sealEnvelope([{ note: forged, policy: FREE_POLICY, viewers: [{ tier: "owner", publicKey: owner.publicKey }] }, null]);
    expect(openOwnerNote(envelope, 0, owner, noteCommitment(note))).toBeUndefined();
  });

  it("rejects a policy that does not match the note's policy hash", () => {
    const owner = generateViewKey();
    const envelope = sealEnvelope([{ note, policy: { ...FREE_POLICY, floor: 1n }, viewers: [{ tier: "owner", publicKey: owner.publicKey }] }, null]);
    expect(openOwnerNote(envelope, 0, owner, noteCommitment(note))).toBeUndefined();
  });

  it("returns nothing for an envelope sealed for another owner", () => {
    const envelope = sealEnvelope([{ note, policy: FREE_POLICY, viewers: [{ tier: "owner", publicKey: generateViewKey().publicKey }] }, null]);
    expect(openOwnerNote(envelope, 0, generateViewKey(), noteCommitment(note))).toBeUndefined();
  });
});
