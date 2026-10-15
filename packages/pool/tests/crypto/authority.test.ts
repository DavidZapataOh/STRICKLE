import { describe, expect, it } from "vitest";
import { combinePartials, dealAuthority, partialDecrypt } from "../../src/crypto/authority.ts";
import { generateViewKey } from "../../src/crypto/keys.ts";
import { envelopeEpk, openSection, sealEnvelope } from "../../src/crypto/envelope.ts";
import { decodeAuthorityPayload } from "../../src/crypto/wire.ts";
import type { Note } from "../../src/note.ts";
import { FREE_POLICY } from "../../src/policy.ts";

const note: Note = { amount: 42n, ownerPk: 1n, policy: 2n, label: 3n, box: "taxes", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt: 4n };

function setup(threshold: number, shares: number) {
  const deal = dealAuthority(threshold, shares);
  const owner = generateViewKey();
  const envelope = sealEnvelope([
    { note, policy: FREE_POLICY, viewers: [{ tier: "owner", publicKey: owner.publicKey }, { tier: "authority", publicKey: deal.publicKey }] },
    null,
  ]);
  return { deal, envelope, epk: envelopeEpk(envelope) };
}

const open = (envelope: `0x${string}`, publicKey: Uint8Array, sharedSecret: Uint8Array) => openSection(envelope, 0, "authority", { publicKey, sharedSecret });

describe("threshold authority", () => {
  it("opens with any two of three shares and agrees on the result", () => {
    const { deal, envelope, epk } = setup(2, 3);
    const subsets = [[0, 1], [0, 2], [1, 2], [0, 1, 2]];
    for (const subset of subsets) {
      const partials = subset.map((i) => partialDecrypt(epk, deal.shares[i] as never));
      const bytes = open(envelope, deal.publicKey, combinePartials(partials)) as Uint8Array;
      expect(decodeAuthorityPayload(bytes)).toEqual({ amount: 42n, asset: "USDC", label: 3n });
    }
  });

  it("does not open with a single share when the threshold is two", () => {
    const { deal, envelope, epk } = setup(2, 3);
    for (const share of deal.shares) {
      expect(open(envelope, deal.publicKey, combinePartials([partialDecrypt(epk, share)]))).toBeUndefined();
    }
  });

  it("does not open with shares from another deal", () => {
    const { deal, envelope, epk } = setup(2, 3);
    const other = dealAuthority(2, 3);
    const partials = [partialDecrypt(epk, deal.shares[0] as never), partialDecrypt(epk, other.shares[1] as never)];
    expect(open(envelope, deal.publicKey, combinePartials(partials))).toBeUndefined();
  });

  it("rejects a repeated share index and an empty set", () => {
    const { deal, epk } = setup(2, 3);
    const same = partialDecrypt(epk, deal.shares[0] as never);
    expect(() => combinePartials([same, same])).toThrow(/duplicate/i);
    expect(() => combinePartials([])).toThrow(/at least one/i);
  });

  it("works for a 3-of-5 deal and never hands out the group secret as a share", () => {
    const { deal, envelope, epk } = setup(3, 5);
    expect(deal.shares).toHaveLength(5);
    const partials = [4, 1, 2].map((i) => partialDecrypt(epk, deal.shares[i] as never));
    expect(open(envelope, deal.publicKey, combinePartials(partials))).toBeDefined();
    expect(open(envelope, deal.publicKey, combinePartials(partials.slice(0, 2)))).toBeUndefined();
    const values = new Set(deal.shares.map((s) => s.value));
    expect(values.size).toBe(5);
  });

  it("validates the deal parameters", () => {
    expect(() => dealAuthority(1, 3)).toThrow(RangeError);
    expect(() => dealAuthority(4, 3)).toThrow(RangeError);
  });
});
