import { describe, expect, it } from "vitest";
import { isPasskeyCancelled } from "../src/wallet/errors.ts";

describe("isPasskeyCancelled", () => {
  it("recognizes a dismissed or timed-out passkey prompt by name or message", () => {
    expect(isPasskeyCancelled(Object.assign(new Error("The operation either timed out or was not allowed."), { name: "NotAllowedError" }))).toBe(true);
    expect(isPasskeyCancelled(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(true);
    expect(isPasskeyCancelled(new Error("User cancelled the request"))).toBe(true);
    expect(isPasskeyCancelled("dismissed")).toBe(true);
  });

  it("does not take an unrelated failure for a cancellation", () => {
    expect(isPasskeyCancelled(new Error("network down"))).toBe(false);
    expect(isPasskeyCancelled(undefined)).toBe(false);
  });
});
