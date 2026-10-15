import { type Hex, bytesToHex, hexToBytes } from "viem";
import { describe, expect, it } from "vitest";
import { generateViewKey } from "../../src/crypto/keys.ts";
import { type Viewer, openSection, sealEnvelope } from "../../src/crypto/envelope.ts";
import { decodeAccountantPayload, decodeAuthorityPayload, decodeOwnerPayload } from "../../src/crypto/wire.ts";
import type { Note } from "../../src/note.ts";
import { FREE_POLICY } from "../../src/policy.ts";

const note = (amount: bigint, salt: bigint): Note => ({
  amount,
  ownerPk: 111n,
  policy: 222n,
  label: 333n,
  box: "salary",
  asset: "USDC",
  flags: 0,
  lockUntil: 1_900_000_000n,
  salt,
});

const owner = generateViewKey();
const accountant = generateViewKey();
const authority = generateViewKey();
const stranger = generateViewKey();
const viewers: Viewer[] = [
  { tier: "owner", publicKey: owner.publicKey },
  { tier: "accountant", publicKey: accountant.publicKey },
  { tier: "authority", publicKey: authority.publicKey },
];
const first = note(500_000n, 9001n);
const second = note(250_000n, 9002n);

function seal(): Hex {
  return sealEnvelope([
    { note: first, policy: FREE_POLICY, viewers },
    { note: second, policy: FREE_POLICY, viewers },
  ]);
}

const as = (key: { secret: bigint; publicKey: Uint8Array }) => ({ secret: key.secret, publicKey: key.publicKey });

describe("envelope", () => {
  it("lets each tier open its own section of each output", () => {
    const envelope = seal();
    for (const [index, expected] of [first, second].entries()) {
      const ownerBytes = openSection(envelope, index as 0 | 1, "owner", as(owner));
      expect(decodeOwnerPayload(ownerBytes as Uint8Array).note).toEqual(expected);
      const accountantBytes = openSection(envelope, index as 0 | 1, "accountant", as(accountant));
      expect(decodeAccountantPayload(accountantBytes as Uint8Array).amount).toBe(expected.amount);
      const authorityBytes = openSection(envelope, index as 0 | 1, "authority", as(authority));
      expect(decodeAuthorityPayload(authorityBytes as Uint8Array)).toEqual({ amount: expected.amount, asset: "USDC", label: 333n });
    }
  });

  it("keeps the tiers apart: the accountant and the authority see no secrets", () => {
    const envelope = seal();
    const accountantBytes = openSection(envelope, 0, "accountant", as(accountant)) as Uint8Array;
    const authorityBytes = openSection(envelope, 0, "authority", as(authority)) as Uint8Array;
    expect(accountantBytes).toHaveLength(51);
    expect(authorityBytes).toHaveLength(41);
    const saltBytes = hexToBytes(`0x${(9001n).toString(16).padStart(64, "0")}`);
    const contains = (haystack: Uint8Array) => bytesToHex(haystack).includes(bytesToHex(saltBytes).slice(2));
    expect(contains(accountantBytes)).toBe(false);
    expect(contains(authorityBytes)).toBe(false);
    expect(openSection(envelope, 0, "owner", as(accountant))).toBeUndefined();
    expect(openSection(envelope, 0, "accountant", as(authority))).toBeUndefined();
    expect(openSection(envelope, 0, "authority", as(owner))).toBeUndefined();
  });

  it("gives nothing to someone without a section or with the wrong secret", () => {
    const envelope = seal();
    expect(openSection(envelope, 0, "owner", as(stranger))).toBeUndefined();
    expect(openSection(envelope, 0, "owner", { secret: stranger.secret, publicKey: owner.publicKey })).toBeUndefined();
  });

  it("separates the two outputs: a section is bound to its output index", () => {
    const envelope = seal();
    const zero = openSection(envelope, 0, "owner", as(owner)) as Uint8Array;
    const one = openSection(envelope, 1, "owner", as(owner)) as Uint8Array;
    expect(bytesToHex(zero)).not.toBe(bytesToHex(one));
  });

  it("refuses a section moved to the other output's slot (the wrap is bound to its index)", () => {
    const envelope = sealEnvelope([
      { note: first, policy: FREE_POLICY, viewers: [{ tier: "owner", publicKey: owner.publicKey }] },
      { note: first, policy: FREE_POLICY, viewers: [{ tier: "owner", publicKey: owner.publicKey }] },
    ]);
    const bytes = hexToBytes(envelope);
    const length = (bytes.length - 34 - 2) / 2;
    const swapped = new Uint8Array(bytes);
    swapped.set(bytes.slice(35 + length + 1, 35 + 2 * length + 1), 35);
    swapped.set(bytes.slice(35, 35 + length), 35 + length + 1);
    expect(openSection(bytesToHex(swapped), 0, "owner", as(owner))).toBeUndefined();
    expect(openSection(bytesToHex(swapped), 1, "owner", as(owner))).toBeUndefined();
    expect(openSection(envelope, 0, "owner", as(owner))).toBeDefined();
  });

  it("is randomised: two seals of the same plaintext differ", () => {
    expect(seal()).not.toBe(seal());
  });

  it("rejects any single flipped byte for every tier", () => {
    const envelope = seal();
    const bytes = hexToBytes(envelope);
    let accepted = 0;
    for (let position = 0; position < bytes.length; position += 7) {
      const tampered = new Uint8Array(bytes);
      tampered[position] = (tampered[position] as number) ^ 0x01;
      const hex = bytesToHex(tampered);
      for (const [tier, key] of [["owner", owner], ["accountant", accountant], ["authority", authority]] as const) {
        const got = openSection(hex, 0, tier, as(key));
        const original = openSection(envelope, 0, tier, as(key)) as Uint8Array;
        if (got && bytesToHex(got) !== bytesToHex(original)) accepted++;
      }
    }
    expect(accepted).toBe(0);
  });

  it("treats truncated or foreign data as unreadable instead of crashing", () => {
    const envelope = seal();
    expect(openSection("0x", 0, "owner", as(owner))).toBeUndefined();
    expect(openSection(envelope.slice(0, 80) as Hex, 0, "owner", as(owner))).toBeUndefined();
    expect(openSection(`0x02${envelope.slice(4)}` as Hex, 0, "owner", as(owner))).toBeUndefined();
    expect(openSection(`0x${"ff".repeat(200)}` as Hex, 0, "owner", as(owner))).toBeUndefined();
  });

  it("refuses an envelope with trailing bytes", () => {
    const envelope = seal();
    expect(openSection(`${envelope}00` as Hex, 0, "owner", as(owner))).toBeUndefined();
  });

  it("encodes an absent output as empty and still seals the other", () => {
    const envelope = sealEnvelope([null, { note: second, policy: FREE_POLICY, viewers }]);
    expect(openSection(envelope, 0, "owner", as(owner))).toBeUndefined();
    expect(decodeOwnerPayload(openSection(envelope, 1, "owner", as(owner)) as Uint8Array).note).toEqual(second);
  });

  it("fits the pool's 2,048-byte limit in the worst case", () => {
    const envelope = seal();
    expect((envelope.length - 2) / 2).toBeLessThanOrEqual(2048);
  });
});
