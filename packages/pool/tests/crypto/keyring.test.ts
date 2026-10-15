import { describe, expect, it } from "vitest";
import { generateViewKey } from "../../src/crypto/keys.ts";
import { ViewKeyRing } from "../../src/crypto/keyring.ts";
import { openSection, sealEnvelope } from "../../src/crypto/envelope.ts";
import { decodeAccountantPayload } from "../../src/crypto/wire.ts";
import type { Note } from "../../src/note.ts";
import { FREE_POLICY } from "../../src/policy.ts";

const note = (salt: bigint): Note => ({ amount: 10n, ownerPk: 1n, policy: 2n, label: 3n, box: "salary", asset: "USDC", flags: 0, lockUntil: 0n, salt });
const sealWith = (ring: ViewKeyRing, salt: bigint) => sealEnvelope([{ note: note(salt), policy: FREE_POLICY, viewers: ring.viewers() }, null]);

describe("view key ring", () => {
  it("always includes the owner and adds the registered tiers", () => {
    const ring = new ViewKeyRing(generateViewKey());
    expect(ring.viewers().map((v) => v.tier)).toEqual(["owner"]);
    ring.setAccountant(generateViewKey().publicKey);
    ring.setAuthority(generateViewKey().publicKey);
    expect(ring.viewers().map((v) => v.tier)).toEqual(["owner", "accountant", "authority"]);
  });

  it("makes new notes unreadable to a revoked accountant while old ones stay readable", () => {
    const ring = new ViewKeyRing(generateViewKey());
    const accountant = generateViewKey();
    ring.setAccountant(accountant.publicKey);
    const before = sealWith(ring, 1n);
    ring.revokeAccountant();
    const after = sealWith(ring, 2n);
    const viewer = { secret: accountant.secret, publicKey: accountant.publicKey };
    expect(decodeAccountantPayload(openSection(before, 0, "accountant", viewer) as Uint8Array).amount).toBe(10n);
    expect(openSection(after, 0, "accountant", viewer)).toBeUndefined();
  });

  it("gives a replacement accountant access to new notes only", () => {
    const ring = new ViewKeyRing(generateViewKey());
    const first = generateViewKey();
    const second = generateViewKey();
    ring.setAccountant(first.publicKey);
    const early = sealWith(ring, 1n);
    ring.revokeAccountant();
    ring.setAccountant(second.publicKey);
    const late = sealWith(ring, 2n);
    const asSecond = { secret: second.secret, publicKey: second.publicKey };
    expect(openSection(early, 0, "accountant", asSecond)).toBeUndefined();
    expect(openSection(late, 0, "accountant", asSecond)).toBeDefined();
  });

  it("bumps a tier's epoch on every change and keeps the owner through revocations", () => {
    const ring = new ViewKeyRing(generateViewKey());
    expect(ring.epochs()).toEqual({ accountant: 0, authority: 0 });
    ring.setAccountant(generateViewKey().publicKey);
    ring.revokeAccountant();
    ring.setAuthority(generateViewKey().publicKey);
    ring.revokeAuthority();
    expect(ring.epochs()).toEqual({ accountant: 2, authority: 2 });
    expect(ring.viewers().map((v) => v.tier)).toEqual(["owner"]);
  });
});
