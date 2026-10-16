import { describe, expect, it } from "vitest";
import { classifyError } from "../src/onboarding/create.ts";

describe("classifyError", () => {
  it("recognizes a browser without passkeys", () => {
    expect(classifyError(new Error("passkeys are not supported here"))).toBe("unsupported");
  });

  it("recognizes the user dismissing the prompt", () => {
    const aborted = new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
    expect(classifyError(aborted)).toBe("cancelled");
    expect(classifyError(new DOMException("aborted", "AbortError"))).toBe("cancelled");
  });

  it("calls everything else a failure without leaking its text", () => {
    expect(classifyError(new Error("bundler said: AA21 didn't pay prefund"))).toBe("failed");
    expect(classifyError("odd")).toBe("failed");
  });
});
