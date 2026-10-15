import { describe, expect, it } from "vitest";
import { decode, encode } from "../src/json.ts";

describe("bigint-safe json", () => {
  it("round-trips bigint beyond 2^53, nested and in arrays", () => {
    const value = { units: 2n ** 70n, nested: { list: [1n, -5n, "text", null, true] }, plain: 3 };
    expect(decode(encode(value))).toEqual(value);
  });

  it("leaves ordinary objects alone, even with a similar key", () => {
    const value = { $bigint: "not a marker", other: 1 };
    expect(decode(encode(value))).toEqual(value);
  });

  it("writes bigint as a tagged string", () => {
    expect(encode({ a: 7n }).toString()).toBe('{"a":{"$bigint":"7"}}');
  });
});
