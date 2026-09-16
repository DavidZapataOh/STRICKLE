import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkEnv, KNOWN } from "./env.ts";

describe("checkEnv", () => {
  it("accepts an empty environment, which is how the local devnet runs", () => {
    expect(checkEnv({})).toEqual([]);
  });

  it("ignores a variable set to an empty string", () => {
    expect(checkEnv({ MIDNIGHT_INDEXER_URL: "" })).toEqual([]);
  });

  it("accepts the documented defaults", () => {
    expect(
      checkEnv({
        MIDNIGHT_INDEXER_URL: "http://127.0.0.1:8088/api/v4/graphql",
        MIDNIGHT_NODE_URL: "ws://127.0.0.1:9944",
        MIDNIGHT_PROOF_SERVER_URL: "http://127.0.0.1:6300",
        MIDNIGHT_FAUCET_TIMEOUT_MS: "600000",
        PRIVATE_STATE_PASSWORD: "a-long-enough-password",
      }),
    ).toEqual([]);
  });

  it("rejects a value that is not a URL", () => {
    expect(checkEnv({ MIDNIGHT_INDEXER_URL: "127.0.0.1:8088" })).toEqual([
      'MIDNIGHT_INDEXER_URL is "127.0.0.1:8088", expected a URL',
    ]);
  });

  it("rejects a websocket URL where an http one is expected", () => {
    expect(checkEnv({ MIDNIGHT_PROOF_SERVER_URL: "ws://127.0.0.1:6300" })).toEqual([
      "MIDNIGHT_PROOF_SERVER_URL uses ws:, expected http: or https:",
    ]);
  });

  it("rejects an http URL where a websocket one is expected", () => {
    expect(checkEnv({ MIDNIGHT_NODE_URL: "http://127.0.0.1:9944" })).toEqual([
      "MIDNIGHT_NODE_URL uses http:, expected ws: or wss:",
    ]);
  });

  it("rejects a timeout that is not a positive number", () => {
    expect(checkEnv({ MIDNIGHT_FAUCET_TIMEOUT_MS: "soon" })).toEqual([
      'MIDNIGHT_FAUCET_TIMEOUT_MS is "soon", expected a positive number of milliseconds',
    ]);
  });

  it("rejects a private state password that is too short", () => {
    expect(checkEnv({ PRIVATE_STATE_PASSWORD: "short" })).toEqual([
      "PRIVATE_STATE_PASSWORD is 5 characters, the minimum is 16",
    ]);
  });

  it("reports every problem at once", () => {
    expect(checkEnv({ MIDNIGHT_NODE_URL: "nope", MIDNIGHT_FAUCET_TIMEOUT_MS: "-1" })).toEqual([
      'MIDNIGHT_NODE_URL is "nope", expected a URL',
      'MIDNIGHT_FAUCET_TIMEOUT_MS is "-1", expected a positive number of milliseconds',
    ]);
  });

  it("documents exactly the variables it knows", () => {
    const documented = readFileSync(new URL("../.env.example", import.meta.url), "utf8")
      .split("\n")
      .flatMap((line) => line.match(/^([A-Z0-9_]+)=/)?.[1] ?? []);
    expect(documented.sort()).toEqual([...KNOWN].sort());
  });

  it("treats a password that trims to empty exactly as an unset one", () => {
    expect(checkEnv({ PRIVATE_STATE_PASSWORD: "                " })).toEqual([]);
  });

  it("reports the trimmed length for a too-short password with surrounding whitespace", () => {
    expect(checkEnv({ PRIVATE_STATE_PASSWORD: "  short  " })).toEqual([
      "PRIVATE_STATE_PASSWORD is 5 characters, the minimum is 16",
    ]);
  });

  it("accepts a password that is long enough only after trimming surrounding whitespace", () => {
    expect(checkEnv({ PRIVATE_STATE_PASSWORD: `  ${"a".repeat(16)}  ` })).toEqual([]);
  });

  it("rejects Infinity as a faucet timeout", () => {
    expect(checkEnv({ MIDNIGHT_FAUCET_TIMEOUT_MS: "Infinity" })).toEqual([
      'MIDNIGHT_FAUCET_TIMEOUT_MS is "Infinity", expected a positive number of milliseconds',
    ]);
  });

  it("rejects a timeout that overflows to Infinity", () => {
    expect(checkEnv({ MIDNIGHT_FAUCET_TIMEOUT_MS: "1e400" })).toEqual([
      'MIDNIGHT_FAUCET_TIMEOUT_MS is "1e400", expected a positive number of milliseconds',
    ]);
  });

  it("rejects a URL whose hostname is empty because the port was parsed as the host", () => {
    expect(checkEnv({ MIDNIGHT_NODE_URL: "ws:9944" })).toEqual([
      'MIDNIGHT_NODE_URL is "ws:9944", expected a URL',
    ]);
  });

  it("rejects a URL with an empty host and an extra slash", () => {
    expect(checkEnv({ MIDNIGHT_INDEXER_URL: "http:///api" })).toEqual([
      'MIDNIGHT_INDEXER_URL is "http:///api", expected a URL',
    ]);
  });

  it("rejects setting both the wallet seed and the wallet mnemonic", () => {
    expect(
      checkEnv({
        MIDNIGHT_WALLET_SEED: "a".repeat(64),
        MIDNIGHT_WALLET_MNEMONIC: Array(24).fill("word").join(" "),
      }),
    ).toEqual([
      "MIDNIGHT_WALLET_SEED and MIDNIGHT_WALLET_MNEMONIC are both set, expected only one",
    ]);
  });
});
