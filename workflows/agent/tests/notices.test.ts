// workflows/agent/tests/notices.test.ts
import { generateProverKey } from "@strickle/prover/sealed";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { type Notice, noticeAad, openNotice, sealNotice } from "../enclave/notices.ts";
import { parseMaster } from "../enclave/keys.ts";

const master = parseMaster(`0x${"11".repeat(32)}`);
const vault = getAddress("0x00000000000000000000000000000000000000a1");
const other = getAddress("0x00000000000000000000000000000000000000b2");
const user = generateProverKey();
const proposal: Notice = { kind: "proposal", proposalId: "salary-2026-11", amount: "1000000", payee: other, digest: `0x${"ab".repeat(32)}`, expiresAt: 1_800_000_000 };

describe("notices", () => {
  it("opens for the user and for nobody else", () => {
    const sealed = sealNotice(master, user.publicKey, vault, 1n, proposal);
    expect(openNotice(user.secret, user.publicKey, vault, 1n, sealed)).toEqual(proposal);
    const stranger = generateProverKey();
    expect(openNotice(stranger.secret, stranger.publicKey, vault, 1n, sealed)).toBeUndefined();
  });

  it("is bound to the vault and the notice id", () => {
    const sealed = sealNotice(master, user.publicKey, vault, 1n, proposal);
    expect(openNotice(user.secret, user.publicKey, other, 1n, sealed)).toBeUndefined();
    expect(openNotice(user.secret, user.publicKey, vault, 2n, sealed)).toBeUndefined();
  });

  it("is deterministic per (vault, id) and different across ids, because the enclave has no entropy", () => {
    const a = sealNotice(master, user.publicKey, vault, 1n, proposal);
    expect(sealNotice(master, user.publicKey, vault, 1n, proposal)).toEqual(a);
    expect(sealNotice(master, user.publicKey, vault, 2n, proposal)).not.toEqual(a);
  });

  it("never reuses an ephemeral key for two different notices that race for the same id", () => {
    const other: Notice = { kind: "decision", proposalId: "salary-2026-11", status: "rejected" };
    const a = sealNotice(master, user.publicKey, vault, 1n, proposal);
    const b = sealNotice(master, user.publicKey, vault, 1n, other);
    expect(a.slice(1, 33)).not.toEqual(b.slice(1, 33));
  });

  it("does not contain the plaintext", () => {
    const sealed = sealNotice(master, user.publicKey, vault, 1n, proposal);
    expect(Buffer.from(sealed).toString("latin1")).not.toContain("salary-2026-11");
  });

  it("derives the associated data from the vault and the id", () => {
    expect(noticeAad(vault, 1n)).not.toEqual(noticeAad(vault, 2n));
    expect(noticeAad(vault, 1n)).not.toEqual(noticeAad(other, 1n));
  });
});
