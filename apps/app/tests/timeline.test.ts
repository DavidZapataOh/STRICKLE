import { proposalDigest } from "@strickle/agent/proposals";
import { noticeAad, type Notice } from "@strickle/agent/notices";
import { generateProverKey, scalarFrom, sealWith } from "@strickle/prover/sealed";
import { undoSummary } from "@strickle/brain";
import { type Hex, bytesToHex, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { APPROVAL_MARGIN_SECONDS, UNDO_REASON, buildReceipts, canApprove, canReject, foldProposals, openNotices } from "../src/activity/timeline.ts";
import type { ChainReceipt, SealedNotice } from "../src/activity/types.ts";

const vault = getAddress("0x00000000000000000000000000000000000000a1");
const payee = getAddress("0x00000000000000000000000000000000000000b2");
const key = generateProverKey();
const tx = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;

const seal = (id: bigint, notice: Notice | Record<string, unknown>, at = 1_800_000_000): SealedNotice => {
  const plain = new TextEncoder().encode(JSON.stringify(notice));
  const sealed = sealWith(plain, key.publicKey, noticeAad(vault, id), scalarFrom(new Uint8Array(64).fill(Number(id) + 1)));
  return { id, sealed: bytesToHex(sealed), txHash: tx(Number(id)), blockNumber: 100n + id, logIndex: 0, timestamp: at };
};

// the digest the enclave computes for a salary proposal of that month
const proposal = (id: string, expiresAt: number, month = "2026-11", digest?: Hex): Notice => ({
  kind: "proposal",
  proposalId: id,
  amount: "1800000000",
  payee,
  digest: digest ?? proposalDigest({ payee, amount: "1800000000", month }),
  expiresAt,
});

describe("openNotices", () => {
  it("opens what the key can open and marks the rest unreadable", () => {
    const other = generateProverKey();
    const sealedOther = { ...seal(2n, proposal("salary-2026-11", 1_900_000_000)), sealed: bytesToHex(sealWith(new TextEncoder().encode("{}"), other.publicKey, noticeAad(vault, 2n), 5n)) };
    const out = openNotices([seal(1n, proposal("salary-2026-11", 1_900_000_000)), sealedOther], vault, key);
    expect(out[0]?.notice).toMatchObject({ kind: "proposal", proposalId: "salary-2026-11" });
    expect(out[1]?.notice).toBeNull();
  });

  it("without a key nothing is readable and nothing throws", () => {
    expect(openNotices([seal(1n, proposal("salary-2026-11", 1))], vault, null).map((item) => item.notice)).toEqual([null]);
  });

  it("refuses a notice sealed for another notice id (the id is part of the associated data)", () => {
    const moved = { ...seal(1n, proposal("salary-2026-11", 1_900_000_000)), id: 9n };
    expect(openNotices([moved], vault, key)[0]?.notice).toBeNull();
  });

  it("treats a notice that opens but does not match the notice schema as unreadable", () => {
    expect(openNotices([seal(1n, { kind: "proposal", proposalId: "x", amount: "not a number" })], vault, key)[0]?.notice).toBeNull();
    expect(openNotices([seal(2n, { kind: "unknown-kind" })], vault, key)[0]?.notice).toBeNull();
  });
});

describe("foldProposals", () => {
  const now = 1_800_100_000;

  it("keeps a proposal pending until it is decided or runs out", () => {
    const opened = openNotices([seal(1n, proposal("salary-2026-11", now + 1000))], vault, key);
    expect(foldProposals(opened, now)).toEqual([expect.objectContaining({ proposalId: "salary-2026-11", state: "pending", amount: 1_800_000_000n, payee, verified: true })]);
    expect(foldProposals(opened, now + 2000)[0]?.state).toBe("expired");
  });

  it("follows the decision notices to their final state", () => {
    const opened = openNotices(
      [seal(1n, proposal("salary-2026-11", now + 1000)), seal(2n, { kind: "decision", proposalId: "salary-2026-11", status: "executed" }, now - 5)],
      vault,
      key,
    );
    expect(foldProposals(opened, now)[0]).toMatchObject({ state: "executed", decidedAt: now - 5 });
    const rejected = openNotices([seal(1n, proposal("salary-2026-11", now + 1000)), seal(2n, { kind: "decision", proposalId: "salary-2026-11", status: "rejected" })], vault, key);
    expect(foldProposals(rejected, now)[0]?.state).toBe("rejected");
  });

  it("keeps two proposals apart and lists the newest first", () => {
    const opened = openNotices([seal(1n, proposal("salary-2026-10", now + 1000, "2026-10"), 10), seal(2n, proposal("salary-2026-11", now + 1000), 20)], vault, key);
    expect(foldProposals(opened, now).map((item) => item.proposalId)).toEqual(["salary-2026-11", "salary-2026-10"]);
  });

  it("ignores a decision for a proposal it never saw and the notices it cannot read", () => {
    const opened = openNotices([seal(1n, { kind: "decision", proposalId: "ghost", status: "executed" })], vault, key);
    expect(foldProposals([...opened, { id: 5n, timestamp: 1, txHash: tx(5), notice: null }], now)).toEqual([]);
  });

  it("recomputes the digest from the notice's own fields and flags a mismatch", () => {
    const tampered = openNotices([seal(1n, proposal("salary-2026-11", now + 1000, "2026-11", `0x${"cd".repeat(32)}`))], vault, key);
    expect(foldProposals(tampered, now)[0]).toMatchObject({ verified: false });
    const wrongMonth = openNotices([seal(1n, proposal("salary-2026-12", now + 1000, "2026-11"))], vault, key);
    expect(foldProposals(wrongMonth, now)[0]).toMatchObject({ verified: false });
    const odd = openNotices([seal(1n, proposal("custom-id", now + 1000))], vault, key);
    expect(foldProposals(odd, now)[0]).toMatchObject({ verified: false });
  });
});

describe("what the user may decide", () => {
  const now = 1_800_100_000;
  const make = (expiresAt: number, digest?: Hex) => foldProposals(openNotices([seal(1n, proposal("salary-2026-11", expiresAt, "2026-11", digest))], vault, key), now)[0] as ReturnType<typeof foldProposals>[number];

  it("approves only a pending, verified proposal with enough time left for the gateway and the enclave", () => {
    expect(canApprove(make(now + 3600), now)).toBe(true);
    expect(canApprove(make(now + APPROVAL_MARGIN_SECONDS), now)).toBe(false);
    expect(canApprove(make(now + APPROVAL_MARGIN_SECONDS + 1), now)).toBe(true);
    expect(canApprove(make(now - 1), now)).toBe(false);
    expect(canApprove(make(now + 3600, `0x${"cd".repeat(32)}`), now)).toBe(false);
  });

  it("rejects only a proposal that is still pending and not expired", () => {
    expect(canReject(make(now + 3600), now)).toBe(true);
    expect(canReject(make(now + 5), now)).toBe(true);
    expect(canReject(make(now - 1), now)).toBe(false);
  });
});

describe("buildReceipts", () => {
  const split: ChainReceipt = { type: "split", vault, asset: 1, total: 1_000_000_000n, byBox: { taxes: 200_000_000n, operating: 600_000_000n, profit: 200_000_000n }, txHash: tx(1), blockNumber: 100n, logIndex: 5, timestamp: 1_800_000_000 };
  const salary: ChainReceipt = { type: "salary", vault, asset: 1, payee, amount: 1_800_000_000n, txHash: tx(2), blockNumber: 120n, logIndex: 2, timestamp: 1_800_050_000 };
  const priv: ChainReceipt = { type: "private-spend", vault, amount: 300_000n, recipient: payee, txHash: tx(3), blockNumber: 130n, logIndex: 3, timestamp: 1_800_060_000 };

  it("lists receipts newest first with the three languages' own texts", () => {
    const en = buildReceipts([split, salary, priv], "en");
    expect(en.map((item) => item.kind)).toEqual(["payment", "salary", "split"]);
    expect(buildReceipts([salary], "es")[0]?.text).not.toBe(buildReceipts([salary], "en")[0]?.text);
    expect(buildReceipts([salary], "pt-br")[0]?.text).toMatch(/1\.800,00/);
  });

  it("carries the split's amounts per box, in box order, and the cascade rule", () => {
    const [item] = buildReceipts([split], "en");
    expect(item?.parts).toEqual([
      { box: "taxes", units: 200_000_000n },
      { box: "operating", units: 600_000_000n },
      { box: "profit", units: 200_000_000n },
    ]);
    expect(item).toMatchObject({ ruleId: "cascade", total: 1_000_000_000n });
  });

  it("never offers undo: the brain says none of these can be undone and so does the screen", () => {
    for (const [kind, reason] of Object.entries(UNDO_REASON)) {
      expect(undoSummary(kind as never).undoable).toBe(false);
      expect(reason).toBeTruthy();
    }
    for (const item of buildReceipts([split, salary, priv], "en")) expect(item.undo.undoable).toBe(false);
  });

  it("identifies a receipt by its transaction and log index, so two identical splits never collide", () => {
    expect(buildReceipts([split], "en")[0]?.id).toBe(`${tx(1)}:5`);
    const ids = buildReceipts([split, { ...split, logIndex: 6 }, { ...split, txHash: tx(9) }], "en").map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
  });
});
