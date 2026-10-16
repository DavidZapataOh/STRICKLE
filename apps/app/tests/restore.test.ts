import "fake-indexeddb/auto";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { generateNoticeKey, loadNoticeKey } from "../src/keys/notice-key.ts";
import { encodeRecoveryCode } from "../src/keys/recovery-code.ts";
import { restoreFromCode } from "../src/keys/restore.ts";

const vault = getAddress("0x00000000000000000000000000000000000000c1");

describe("restoreFromCode", () => {
  it("refuses a code that is not valid and stores nothing", async () => {
    expect(await restoreFromCode(vault, "nope")).toEqual({ ok: false, reason: "invalid" });
    expect(await loadNoticeKey(vault)).toBeNull();
  });

  it("stores a valid code and reports it unverified when there is nothing to check it on", async () => {
    const key = generateNoticeKey();
    expect(await restoreFromCode(vault, encodeRecoveryCode(key.secret))).toEqual({ ok: true, verified: false });
    expect((await loadNoticeKey(vault))?.secret).toBe(key.secret);
  });

  it("verifies against a real notice when it can, and refuses a code that does not open it", async () => {
    const other = getAddress("0x00000000000000000000000000000000000000c2");
    const right = generateNoticeKey();
    const wrong = generateNoticeKey();
    expect(await restoreFromCode(other, encodeRecoveryCode(right.secret), async (key) => key.secret === right.secret)).toEqual({ ok: true, verified: true });
    const third = getAddress("0x00000000000000000000000000000000000000c3");
    expect(await restoreFromCode(third, encodeRecoveryCode(wrong.secret), async (key) => key.secret === right.secret)).toEqual({ ok: false, reason: "mismatch" });
    expect(await loadNoticeKey(third)).toBeNull();
    expect(await restoreFromCode(third, encodeRecoveryCode(wrong.secret), async () => "unknown")).toEqual({ ok: true, verified: false });
  });
});
