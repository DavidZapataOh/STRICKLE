import { describe, expect, it } from "vitest";
import { FREE_POLICY, type Policy } from "../../src/policy.ts";
import type { Note } from "../../src/note.ts";
import {
  decodeAccountantPayload,
  decodeAuthorityPayload,
  decodeOwnerPayload,
  encodeAccountantPayload,
  encodeAuthorityPayload,
  encodeOwnerPayload,
} from "../../src/crypto/wire.ts";

const note: Note = {
  amount: 123_456_789n,
  ownerPk: 111n,
  policy: 222n,
  label: 333n,
  box: "payroll",
  asset: "EURC",
  flags: 1,
  lockUntil: 1_900_000_000n,
  salt: 444n,
};
const policy: Policy = { floor: 5n, allowlistRoot: 6n, restricted: true, agentKeyHash: 7n, agentCap: 8n, agentActions: 9, releaseDelay: 10, templateRoot: 11n };

describe("payload layouts", () => {
  it("round-trips the owner payload in 265 bytes", () => {
    const bytes = encodeOwnerPayload({ note, policy });
    expect(bytes).toHaveLength(265);
    expect(decodeOwnerPayload(bytes)).toEqual({ note, policy });
  });

  it("round-trips the accountant payload in 51 bytes with no secrets in it", () => {
    const bytes = encodeAccountantPayload(note);
    expect(bytes).toHaveLength(51);
    expect(decodeAccountantPayload(bytes)).toEqual({ amount: note.amount, asset: "EURC", box: "payroll", flags: 1, lockUntil: note.lockUntil, label: note.label });
  });

  it("round-trips the authority payload in 41 bytes", () => {
    const bytes = encodeAuthorityPayload(note);
    expect(bytes).toHaveLength(41);
    expect(decodeAuthorityPayload(bytes)).toEqual({ amount: note.amount, asset: "EURC", label: note.label });
  });

  it("rejects payloads of the wrong length", () => {
    expect(() => decodeOwnerPayload(new Uint8Array(264))).toThrow(RangeError);
    expect(() => decodeAccountantPayload(new Uint8Array(50))).toThrow(RangeError);
    expect(() => decodeAuthorityPayload(new Uint8Array(42))).toThrow(RangeError);
  });

  it("encodes a free policy and the largest values", () => {
    const big: Note = { ...note, amount: 2n ** 64n - 1n, lockUntil: 2n ** 64n - 1n };
    expect(decodeOwnerPayload(encodeOwnerPayload({ note: big, policy: FREE_POLICY }))).toEqual({ note: big, policy: FREE_POLICY });
  });
});
