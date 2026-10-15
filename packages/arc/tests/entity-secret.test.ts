import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendSecret, assertSecretAbsent } from "../src/entity-secret.ts";

const tempEnvFile = () => join(mkdtempSync(join(tmpdir(), "env-")), ".env");

describe("appendSecret", () => {
  it("creates the file readable only by its owner", () => {
    const file = tempEnvFile();
    appendSecret(file, "CIRCLE_ENTITY_SECRET_TESTNET", "abc");
    expect(readFileSync(file, "utf8")).toBe("CIRCLE_ENTITY_SECRET_TESTNET=abc\n");
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("starts a new line when the file does not end with one", () => {
    const file = tempEnvFile();
    writeFileSync(file, "A=1");
    appendSecret(file, "B", "2");
    expect(readFileSync(file, "utf8")).toBe("A=1\nB=2\n");
  });

  it("refuses to overwrite an existing key and does not leak the new value", () => {
    const file = tempEnvFile();
    writeFileSync(file, "KEY=old\n");
    expect(() => appendSecret(file, "KEY", "newvalue")).toThrow(/already exists/);
    expect(() => appendSecret(file, "KEY", "newvalue")).not.toThrow(/newvalue/);
    expect(readFileSync(file, "utf8")).toBe("KEY=old\n");
  });
});

describe("an empty placeholder line (as copied from .env.example)", () => {
  it("is filled in place instead of blocking registration", () => {
    const file = tempEnvFile();
    writeFileSync(file, "A=1\nCIRCLE_ENTITY_SECRET_TESTNET=\nB=2\n");
    appendSecret(file, "CIRCLE_ENTITY_SECRET_TESTNET", "abc");
    expect(readFileSync(file, "utf8")).toBe("A=1\nCIRCLE_ENTITY_SECRET_TESTNET=abc\nB=2\n");
  });

  it("does not count as an existing secret", () => {
    const file = tempEnvFile();
    writeFileSync(file, "KEY=\n");
    expect(() => assertSecretAbsent(file, "KEY")).not.toThrow();
  });
});

describe("assertSecretAbsent", () => {
  it("passes when the file does not exist yet", () => {
    expect(() => assertSecretAbsent(tempEnvFile(), "KEY")).not.toThrow();
  });
});
