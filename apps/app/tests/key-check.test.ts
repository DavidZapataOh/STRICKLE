import { noticeAad } from "@strickle/agent/notices";
import { generateProverKey, scalarFrom, sealWith } from "@strickle/prover/sealed";
import { type Hex, bytesToHex, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { verifyKeyAgainstNotices } from "../src/activity/key-check.ts";

const vault = getAddress("0x00000000000000000000000000000000000000a1");
const mine = generateProverKey();
const other = generateProverKey();

const seal = (id: bigint, to: { publicKey: Uint8Array }): { id: bigint; sealed: Hex } => ({
  id,
  sealed: bytesToHex(sealWith(new TextEncoder().encode(JSON.stringify({ kind: "decision", proposalId: "p-1", status: "executed" })), to.publicKey, noticeAad(vault, id), scalarFrom(new Uint8Array(64).fill(Number(id) + 1)))),
});

describe("verifyKeyAgainstNotices", () => {
  it("matches when the key opens a notice of this vault", () => {
    expect(verifyKeyAgainstNotices([seal(1n, mine), seal(2n, mine)], vault, mine)).toBe("matches");
  });

  it("matches as soon as one of the newest notices opens, even if older ones were sealed to a rotated key", () => {
    expect(verifyKeyAgainstNotices([seal(1n, other), seal(2n, mine)], vault, mine)).toBe("matches");
  });

  it("is a mismatch when notices exist and none opens", () => {
    expect(verifyKeyAgainstNotices([seal(1n, other), seal(2n, other)], vault, mine)).toBe("mismatch");
  });

  it("is unknown when the vault has no notices yet", () => {
    expect(verifyKeyAgainstNotices([], vault, mine)).toBe("unknown");
  });

  it("checks only the newest five notices", () => {
    const old = Array.from({ length: 6 }, (_, i) => seal(BigInt(i + 1), mine));
    const newest = Array.from({ length: 5 }, (_, i) => seal(BigInt(i + 10), other));
    expect(verifyKeyAgainstNotices([...old, ...newest], vault, mine)).toBe("mismatch");
  });
});
