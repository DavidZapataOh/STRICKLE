import { describe, expect, it } from "vitest";
import { assertRegistrationName, toUserOperationCalls } from "../src/passkey.ts";

describe("toUserOperationCalls", () => {
  it("keeps the order and defaults the value to zero", () => {
    const calls = toUserOperationCalls([
      { to: "0x00000000000000000000000000000000000000a1", data: "0x01" },
      { to: "0x00000000000000000000000000000000000000a2", data: "0x02", value: 5n },
    ]);
    expect(calls).toEqual([
      { to: "0x00000000000000000000000000000000000000a1", data: "0x01", value: 0n },
      { to: "0x00000000000000000000000000000000000000a2", data: "0x02", value: 5n },
    ]);
  });

  it("refuses an empty batch", () => {
    expect(() => toUserOperationCalls([])).toThrow();
  });
});

describe("assertRegistrationName", () => {
  it("asks for a name only when registering", () => {
    expect(() => assertRegistrationName("register", "")).toThrow();
    expect(() => assertRegistrationName("register", undefined)).toThrow();
    expect(() => assertRegistrationName("register", "  ")).toThrow();
    expect(() => assertRegistrationName("register", "maria@strickle")).not.toThrow();
    expect(() => assertRegistrationName("login", undefined)).not.toThrow();
    expect(() => assertRegistrationName("login", "")).not.toThrow();
  });
});
