// workflows/agent/tests/keys.test.ts
import { open, seal } from "@strickle/prover/sealed";
import { describe, expect, it } from "vitest";
import { type Address, getAddress } from "viem";
import { decryptState, deriveSealKey, encryptState, parseMaster, profileAad, stateKey } from "../enclave/keys.ts";

const MASTER = `0x${"11".repeat(32)}`;
const OTHER = `0x${"22".repeat(32)}`;
const vaultA = getAddress("0x00000000000000000000000000000000000000a1") as Address;
const vaultB = getAddress("0x00000000000000000000000000000000000000b2") as Address;
const text = (value: string) => new TextEncoder().encode(value);

describe("parseMaster", () => {
  it("accepts 32 hex bytes", () => {
    expect(parseMaster(MASTER)).toHaveLength(32);
  });

  it.each(["", "not hex", "0x1234", `0x${"zz".repeat(32)}`, `${"11".repeat(32)}`])("rejects %j without echoing it", (bad) => {
    let message = "";
    try {
      parseMaster(bad);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("AGENT_MASTER is not 32 hex bytes");
  });
});

describe("deriveSealKey", () => {
  it("is deterministic per master and different across masters", () => {
    const a = deriveSealKey(parseMaster(MASTER));
    expect(deriveSealKey(parseMaster(MASTER)).publicKey).toEqual(a.publicKey);
    expect(deriveSealKey(parseMaster(OTHER)).publicKey).not.toEqual(a.publicKey);
  });

  it("opens what the prover's sealed box sealed to its public key, and only under the same associated data", () => {
    const key = deriveSealKey(parseMaster(MASTER));
    const sealed = seal(text("profile"), key.publicKey, profileAad(vaultA));
    expect(open(sealed, key.secret, key.publicKey, profileAad(vaultA))).toEqual(text("profile"));
    expect(open(sealed, key.secret, key.publicKey, profileAad(vaultB))).toBeUndefined();
  });
});

describe("state encryption", () => {
  const master = parseMaster(MASTER);

  it("round-trips", () => {
    const ciphertext = encryptState(master, vaultA, 1n, text("hello"));
    expect(decryptState(master, vaultA, 1n, ciphertext)).toEqual(text("hello"));
  });

  it("is deterministic for the same (vault, version, plaintext) and different for another version", () => {
    const one = encryptState(master, vaultA, 1n, text("hello"));
    expect(encryptState(master, vaultA, 1n, text("hello"))).toEqual(one);
    expect(encryptState(master, vaultA, 2n, text("hello"))).not.toEqual(one);
  });

  it("never reuses a nonce for two different plaintexts at the same (vault, version)", () => {
    const a = encryptState(master, vaultA, 1n, text("first profile"));
    const b = encryptState(master, vaultA, 1n, text("second profile"));
    expect(a.slice(0, 24)).not.toEqual(b.slice(0, 24));
  });

  it("stores the nonce in front of the ciphertext", () => {
    const stored = encryptState(master, vaultA, 1n, text("hello"));
    expect(stored.length).toBe(24 + "hello".length + 16);
  });

  it("refuses an input too short to hold a nonce and a tag", () => {
    expect(() => decryptState(master, vaultA, 1n, new Uint8Array(39))).toThrow(/^state did not decrypt$/);
  });

  it("does not contain the plaintext", () => {
    const ciphertext = encryptState(master, vaultA, 1n, text("taxRateBps:2000"));
    expect(Buffer.from(ciphertext).toString("latin1")).not.toContain("taxRateBps");
  });

  it.each([
    ["another vault", () => decryptState(master, vaultB, 1n, encryptState(master, vaultA, 1n, text("x")))],
    ["another version", () => decryptState(master, vaultA, 2n, encryptState(master, vaultA, 1n, text("x")))],
    ["another master", () => decryptState(parseMaster(OTHER), vaultA, 1n, encryptState(master, vaultA, 1n, text("x")))],
    [
      "a flipped byte",
      () => {
        const ciphertext = encryptState(master, vaultA, 1n, text("x"));
        ciphertext[ciphertext.length - 1] ^= 1;
        return decryptState(master, vaultA, 1n, ciphertext);
      },
    ],
  ])("refuses %s with a message that names nothing", (_name, run) => {
    expect(run).toThrow(/^state did not decrypt$/);
  });

  it("derives a different state key per vault", () => {
    expect(stateKey(master, vaultA)).not.toEqual(stateKey(master, vaultB));
  });
});
