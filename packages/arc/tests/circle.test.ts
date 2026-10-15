import { describe, expect, it } from "vitest";
import { circleCredentials } from "../src/circle.ts";

describe("circleCredentials", () => {
  it("reads the variables of the requested environment", () => {
    const env = {
      CIRCLE_API_KEY_TESTNET: "tkey",
      CIRCLE_ENTITY_SECRET_TESTNET: "tsecret",
      CIRCLE_API_KEY_MAINNET: "mkey",
      CIRCLE_ENTITY_SECRET_MAINNET: "msecret",
    };
    expect(circleCredentials("testnet", env)).toEqual({ apiKey: "tkey", entitySecret: "tsecret" });
    expect(circleCredentials("mainnet", env)).toEqual({ apiKey: "mkey", entitySecret: "msecret" });
  });

  it("names the missing variable", () => {
    expect(() => circleCredentials("mainnet", { CIRCLE_API_KEY_MAINNET: "k" })).toThrow("CIRCLE_ENTITY_SECRET_MAINNET");
  });

  it("treats an empty value as missing", () => {
    expect(() => circleCredentials("testnet", { CIRCLE_API_KEY_TESTNET: "", CIRCLE_ENTITY_SECRET_TESTNET: "s" })).toThrow(
      "CIRCLE_API_KEY_TESTNET",
    );
  });
});
