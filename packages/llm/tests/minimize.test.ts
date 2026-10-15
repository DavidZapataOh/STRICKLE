import { describe, expect, it } from "vitest";
import { minimize } from "../src/minimize.ts";

describe("minimize", () => {
  it("keeps allow-listed scalars only and never returns the original object", () => {
    const input = { description: "Acme retainer", amount: "100.00", secret: "x", nested: { a: 1 } };
    const out = minimize(input, ["description", "amount"]);
    expect(out).toEqual({ description: "Acme retainer", amount: "100.00" });
    expect(out).not.toBe(input);
  });
  it("masks emails and runs of 8 or more digits in free text, keeps short numbers", () => {
    expect(minimize({ memo: "pay maria@example.com ref 12345678 invoice 42" }, ["memo"]).memo).toBe("pay [email] ref [number] invoice 42");
    expect(minimize({ memo: "IBAN ES9121000418450200051332" }, ["memo"]).memo).toContain("[number]");
  });
  it("turns numbers and booleans into strings and drops everything else", () => {
    expect(minimize({ a: 5, b: true, c: null, d: undefined, e: [1] }, ["a", "b", "c", "d", "e"])).toEqual({ a: "5", b: "true" });
  });
  it("rejects a non-object input", () => {
    expect(() => minimize("text", ["a"])).toThrow(TypeError);
  });
});
