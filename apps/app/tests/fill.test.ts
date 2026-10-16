import { describe, expect, it } from "vitest";
import { fill } from "../src/i18n/fill.ts";

describe("fill", () => {
  it("replaces every placeholder, including repeats", () => {
    expect(fill("Step {n} of {total}", { n: 2, total: 6 })).toBe("Step 2 of 6");
    expect(fill("{a}{a}", { a: "x" })).toBe("xx");
  });

  it("leaves an unknown placeholder visible instead of printing undefined", () => {
    expect(fill("Hello {name}", {})).toBe("Hello {name}");
  });
});
