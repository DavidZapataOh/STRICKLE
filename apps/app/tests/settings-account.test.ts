import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { currentAccount } from "../src/settings/account.ts";

const owner = "0x00000000000000000000000000000000000000a1" as const;
const vault = "0x00000000000000000000000000000000000000b2" as const;
const other = "0x00000000000000000000000000000000000000c3" as const;
const store = (value: string | null) => ({ getItem: () => value, setItem: () => undefined, removeItem: () => undefined });
const session = JSON.stringify({ owner, vault, username: "maria", createdAt: 1_800_000_000 });
const older = JSON.stringify({ owner, vault, createdAt: 1_800_000_000 });

describe("currentAccount", () => {
  it("is built from the session alone", () => {
    // the session module hands addresses back checksummed
    expect(currentAccount(store(session))).toEqual({ owner: getAddress(owner), vault: getAddress(vault), username: "maria" });
  });

  it("keeps working for an older session without a passkey name", () => {
    expect(currentAccount(store(older))).toEqual({ owner: getAddress(owner), vault: getAddress(vault), username: "" });
  });

  it("is null without a session or with a damaged one", () => {
    expect(currentAccount(store(null))).toBeNull();
    expect(currentAccount(store("not json"))).toBeNull();
    expect(currentAccount(store(JSON.stringify({ owner: other })))).toBeNull();
  });
});
