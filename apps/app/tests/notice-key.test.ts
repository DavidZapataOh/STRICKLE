import "fake-indexeddb/auto";
import { generateProverKey } from "@strickle/prover/sealed";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { CONFIRM_GROUPS, confirmsRecovery, decodeRecoveryCode, encodeRecoveryCode, groupsOf, noticePublicKey } from "../src/keys/recovery-code.ts";
import { forgetNoticeKey, generateNoticeKey, loadNoticeKey, noticeKeyFromSecret, saveNoticeKey } from "../src/keys/notice-key.ts";

const vault = getAddress("0x00000000000000000000000000000000000000a1");
const other = getAddress("0x00000000000000000000000000000000000000a2");

describe("the recovery code", () => {
  it("round-trips any key and is eleven groups of five", () => {
    for (let i = 0; i < 20; i++) {
      const { secret } = generateProverKey();
      const code = encodeRecoveryCode(secret);
      expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{5}-){10}[0-9A-HJKMNP-TV-Z]{5}$/);
      expect(decodeRecoveryCode(code)).toBe(secret);
    }
  });

  it("is forgiving about case, spaces, dashes and the look-alike letters", () => {
    const { secret } = generateProverKey();
    const code = encodeRecoveryCode(secret);
    expect(decodeRecoveryCode(code.toLowerCase().replaceAll("-", " "))).toBe(secret);
    expect(decodeRecoveryCode(code.replaceAll("-", "").replaceAll("1", "l").replaceAll("0", "O"))).toBe(secret);
  });

  it("rejects a typo, a truncated code and garbage", () => {
    const code = encodeRecoveryCode(generateProverKey().secret);
    const typo = `${code.slice(0, 6)}${code[6] === "7" ? "8" : "7"}${code.slice(7)}`;
    expect(decodeRecoveryCode(typo)).toBeUndefined();
    expect(decodeRecoveryCode(code.slice(0, -6))).toBeUndefined();
    expect(decodeRecoveryCode("not a code")).toBeUndefined();
    expect(decodeRecoveryCode("")).toBeUndefined();
  });

  it("refuses a well-formed code whose secret is not a valid key", () => {
    expect(decodeRecoveryCode(encodeRecoveryCode(0n))).toBeUndefined();
    expect(noticePublicKey(0n)).toBeUndefined();
  });

  it("asks the user to type back two fixed groups and accepts only the right ones", () => {
    const code = encodeRecoveryCode(generateProverKey().secret);
    const groups = groupsOf(code);
    const [a, b] = CONFIRM_GROUPS;
    expect(confirmsRecovery(code, [groups[a]!, groups[b]!])).toBe(true);
    expect(confirmsRecovery(code, [groups[a]!.toLowerCase(), groups[b]!])).toBe(true);
    expect(confirmsRecovery(code, [groups[b]!, groups[a]!])).toBe(false);
    expect(confirmsRecovery(code, ["", ""])).toBe(false);
  });
});

describe("the stored notice key", () => {
  it("comes back as the same key it was saved as", async () => {
    const key = generateNoticeKey();
    await saveNoticeKey(vault, key.secret);
    const loaded = await loadNoticeKey(vault);
    expect(loaded?.secret).toBe(key.secret);
    expect(loaded?.publicKey).toEqual(key.publicKey);
  });

  it("keeps a key per vault and reports none for an unknown vault", async () => {
    expect(await loadNoticeKey(other)).toBeNull();
    const key = generateNoticeKey();
    await saveNoticeKey(other, key.secret);
    expect((await loadNoticeKey(other))?.secret).toBe(key.secret);
    expect((await loadNoticeKey(vault))?.secret).not.toBe(key.secret);
  });

  it("is case-insensitive on the address and forgets on request", async () => {
    const key = generateNoticeKey();
    await saveNoticeKey(vault, key.secret);
    expect((await loadNoticeKey(vault.toLowerCase() as `0x${string}`))?.secret).toBe(key.secret);
    await forgetNoticeKey(vault);
    expect(await loadNoticeKey(vault)).toBeNull();
  });

  it("never stores the secret in the clear", async () => {
    const key = generateNoticeKey();
    await saveNoticeKey(vault, key.secret);
    const request = <T,>(work: IDBRequest<T>) => new Promise<T>((resolve, reject) => Object.assign(work, { onsuccess: () => resolve(work.result), onerror: () => reject(work.error) }));
    const db = await request(indexedDB.open("strickle-keys", 1));
    const record = (await request(db.transaction("secrets").objectStore("secrets").get(`notice-key:${vault.toLowerCase()}`))) as { wrapped: ArrayBuffer };
    const asHex = [...new Uint8Array(record.wrapped)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(asHex).not.toContain(key.secret.toString(16).padStart(64, "0"));
    db.close();
  });

  it("builds a key from a recovered secret and refuses an invalid one", () => {
    const key = generateNoticeKey();
    expect(noticeKeyFromSecret(key.secret)?.publicKey).toEqual(key.publicKey);
    expect(noticeKeyFromSecret(0n)).toBeUndefined();
  });
});
