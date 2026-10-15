// workflows/agent/tests/profile.test.ts
import { describe, expect, it } from "vitest";
import { MAX_STATE_PLAINTEXT, MAX_SUBMITTED_BYTES, ZERO_ADDRESS, decodeProfile, encodeProfile, profileSchema } from "../enclave/profile.ts";

const valid = {
  version: 1 as const,
  taxRateBps: 2_000,
  taxBufferBps: 10_500,
  payrollShareBps: 10_000,
  floorDays: 14,
  targetDays: 42,
  dailySpend: "40000000",
  payrollDue: "0",
  salaryOwed: "1500000000",
  emergencyTarget: "9000000000",
};

const complete = profileSchema.parse(valid);

describe("profile", () => {
  it("round-trips through canonical bytes", () => {
    expect(decodeProfile(encodeProfile(complete))).toEqual(complete);
  });

  it("encodes the same bytes whatever the key order of the input", () => {
    const shuffled = Object.fromEntries(Object.entries(complete).reverse()) as typeof complete;
    expect(encodeProfile(shuffled)).toEqual(encodeProfile(complete));
  });

  it("stays well under the contract's size cap", () => {
    expect(encodeProfile(complete).length).toBeLessThan(MAX_SUBMITTED_BYTES / 2);
    expect(MAX_SUBMITTED_BYTES + 49).toBeLessThanOrEqual(4_800);
    expect(MAX_STATE_PLAINTEXT + 24 + 16).toBe(16_384);
  });

  it.each([
    ["a tax rate over 100%", { taxRateBps: 10_001 }],
    ["a buffer below 105%", { taxBufferBps: 10_499 }],
    ["a buffer above 110%", { taxBufferBps: 11_001 }],
    ["a negative floor", { floorDays: -1 }],
    ["a target below the floor", { floorDays: 30, targetDays: 20 }],
    ["an amount with a decimal point", { dailySpend: "40.5" }],
    ["a negative amount", { salaryOwed: "-1" }],
    ["an unknown field", { surprise: 1 }],
    ["another version", { version: 2 }],
  ])("refuses %s", (_name, patch) => {
    expect(profileSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("refuses bytes that are not a profile, without echoing them", () => {
    const secretLooking = new TextEncoder().encode('{"taxRateBps":"SUPER-SECRET"}');
    let message = "";
    try {
      decodeProfile(secretLooking);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("profile is not valid");
  });
});


describe("the extended profile", () => {
  const payee = "0x00000000000000000000000000000000000000a1";
  const full = {
    ...valid,
    taxesDue: "250000000",
    salary: { proposed: "1000000000", pending: "0", payee, day: 1, lastPaid: "2026-10" },
    limits: { dailyCap: "2000000000", signatureThreshold: "1500000000" },
    history: [["2026-10-01", "500000000", "deposit"], ["2026-10-04", "-40000000", "rent"]] as [string, string, string][],
    payrolls: [["2026-11-05", "300000000"]] as [string, string][],
    clockOffsetDays: 17,
    tick: { lastDay: "2026-10-31", p10: "-5000000", p50: "900000000" },
    breaker: { halted: false, since: "", codes: [] as string[] },
  };

  it("round-trips through canonical bytes", () => {
    expect(decodeProfile(encodeProfile(full))).toEqual(full);
  });

  it("decodes a profile written before these fields existed, failing closed", () => {
    const old = new TextEncoder().encode(JSON.stringify(valid));
    const decoded = decodeProfile(old);
    expect(decoded.salary.payee).toBe(ZERO_ADDRESS);
    expect(decoded.limits).toEqual({ dailyCap: "0", signatureThreshold: "0" });
    expect(decoded.history).toEqual([]);
    expect(decoded.breaker.halted).toBe(false);
  });

  it("emits keys in sorted order at every level, whatever the input order", () => {
    const text = new TextDecoder().decode(encodeProfile(full));
    expect(text.indexOf('"breaker"')).toBeLessThan(text.indexOf('"clockOffsetDays"'));
    expect(text.indexOf('"dailyCap"')).toBeLessThan(text.indexOf('"signatureThreshold"'));
  });

  it("fits the stored state with a full history, and a first submission with a shorter one", () => {
    const history = Array.from({ length: 200 }, (_, i) => [`2026-0${1 + (i % 9)}-1${i % 9}`, "123456789012", "deposit-payer"] as [string, string, string]);
    expect(encodeProfile({ ...full, history }).length).toBeLessThan(MAX_STATE_PLAINTEXT);
    expect(encodeProfile({ ...full, history: history.slice(0, 60) }).length).toBeLessThan(MAX_SUBMITTED_BYTES);
  });

  it("drops the oldest history entries instead of refusing when the state would not fit", () => {
    const long = Array.from({ length: 200 }, (_, i) => ["2026-10-01", "1".repeat(30), `${"x".repeat(23)}${i % 10}`] as [string, string, string]);
    const crowded = { ...full, history: long, payrolls: Array.from({ length: 24 }, () => ["2026-11-05", "9".repeat(30)] as [string, string]) };
    const bytes = encodeProfile(crowded);
    expect(bytes.length).toBeLessThanOrEqual(MAX_STATE_PLAINTEXT);
    expect(decodeProfile(bytes).history.at(-1)).toEqual(long.at(-1));
  });

  it.each([
    ["a salary day of 29", { salary: { ...full.salary, day: 29 } }],
    ["a malformed payee", { salary: { ...full.salary, payee: "0x1" } }],
    ["a malformed history date", { history: [["10/01/2026", "1", "deposit"]] }],
    ["more than 200 history entries", { history: Array.from({ length: 201 }, () => ["2026-10-01", "1", "d"]) }],
    ["a source longer than 24 characters", { history: [["2026-10-01", "1", "x".repeat(25)]] }],
    ["more than 24 payrolls", { payrolls: Array.from({ length: 25 }, () => ["2026-11-05", "1"]) }],
    ["an offset of ten years and a day", { clockOffsetDays: 3651 }],
    ["a lastPaid that is not a month", { salary: { ...full.salary, lastPaid: "2026-10-01" } }],
    ["more than seven breaker codes", { breaker: { halted: true, since: "2026-10-01", codes: Array(8).fill("c") } }],
  ])("refuses %s", (_name, patch) => {
    expect(profileSchema.safeParse({ ...full, ...patch }).success).toBe(false);
  });
});
