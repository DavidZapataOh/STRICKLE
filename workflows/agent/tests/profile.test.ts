// workflows/agent/tests/profile.test.ts
import { describe, expect, it } from "vitest";
import { MAX_STATE_PLAINTEXT, MAX_SUBMITTED_BYTES, ZERO_ADDRESS, ZERO_KEY, decodeProfile, encodeProfile, mergeProfile, profileSchema } from "../enclave/profile.ts";

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


const privNote = { note: { amount: "1", ownerPk: "1", policy: "1", label: "1", box: "payroll", asset: "USDC", flags: 0, lockUntil: "0", delayFloor: 0, salt: "1" }, policy: { floor: "0", allowlistRoot: "0", restricted: false, agentKeyHash: "0", agentCap: "0", agentActions: 8, releaseDelay: 0, templateRoot: "0" }, allowlist: [], leafIndex: null };
const privMode = { enabled: true, ak: "1", nk: "2", authHash: "3", ownerPk: "4", viewers: [], notes: [] };

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
    expect(decodeProfile(encodeProfile(profileSchema.parse(full)))).toEqual(profileSchema.parse(full));
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

  const proposal = { id: "salary-2026-11", kind: "salary-day-one" as const, amount: "1000000", payee, digest: `0x${"ab".repeat(32)}`, createdAt: 1_800_000_000, expiresAt: 1_800_604_800, status: "pending" as const, decidedAt: 0 };

  it("round-trips a nonce, a user key and a proposal", () => {
    const more = profileSchema.parse({ ...full, nonce: "7", userKey: `0x${"cd".repeat(32)}`, proposals: [proposal] });
    expect(decodeProfile(encodeProfile(more))).toEqual(more);
  });

  it("decodes an older profile with a zero nonce, no user key and no proposals", () => {
    const decoded = decodeProfile(new TextEncoder().encode(JSON.stringify(valid)));
    expect(decoded.nonce).toBe("0");
    expect(decoded.userKey).toBe(ZERO_KEY);
    expect(decoded.proposals).toEqual([]);
    expect(decoded.privateMode.enabled).toBe(false);
    expect(decoded.privateMode.notes).toEqual([]);
  });

  it.each([
    ["a malformed user key", { userKey: "0x1234" }],
    ["nine proposals", { proposals: Array.from({ length: 9 }, (_, i) => ({ ...proposal, id: `p-${i}` })) }],
    ["an unknown proposal status", { proposals: [{ ...proposal, status: "done" }] }],
    ["a proposal id with spaces", { proposals: [{ ...proposal, id: "not valid" }] }],
    ["a negative nonce", { nonce: "-1" }],
    ["seven private notes", { privateMode: { ...privMode, notes: Array.from({ length: 7 }, () => privNote) } }],
    ["nine allowlist addresses", { privateMode: { ...privMode, notes: [{ ...privNote, allowlist: Array.from({ length: 9 }, () => "0x00000000000000000000000000000000000000b2") }] } }],
    ["four viewers", { privateMode: { ...privMode, viewers: Array.from({ length: 4 }, () => ({ tier: "owner", publicKey: `0x${"ab".repeat(32)}` })) } }],
    ["a non-decimal agent key", { privateMode: { ...privMode, ak: "0xff" } }],
  ])("refuses %s", (_name, patch) => {
    expect(profileSchema.safeParse({ ...full, ...patch }).success).toBe(false);
  });
});

describe("mergeProfile", () => {
  const payee = "0x00000000000000000000000000000000000000a1";
  const base = profileSchema.parse(valid);
  const existing = profileSchema.parse({
    ...valid,
    taxRateBps: 1_000,
    salaryOwed: "777",
    salary: { proposed: "1000000", pending: "250000", payee, day: 1, lastPaid: "2026-11" },
    history: [["2026-10-01", "500000000", "deposit"]],
    tick: { lastDay: "2026-11-01", p10: "-1", p50: "2" },
    breaker: { halted: true, since: "2026-11-01", codes: ["books-balance"] },
  });
  const submitted = profileSchema.parse({
    ...valid,
    taxRateBps: 2_500,
    salary: { proposed: "2000000", pending: "0", payee: "0x00000000000000000000000000000000000000b2", day: 5, lastPaid: "" },
    limits: { dailyCap: "5", signatureThreshold: "6" },
  });

  it("is the submission when nothing exists yet", () => {
    expect(mergeProfile(undefined, submitted)).toEqual(submitted);
  });

  it("takes what the owner edits from the submission", () => {
    const merged = mergeProfile(existing, submitted);
    expect(merged.taxRateBps).toBe(2_500);
    expect(merged.salary).toMatchObject({ proposed: "2000000", day: 5, payee: "0x00000000000000000000000000000000000000b2" });
    expect(merged.limits).toEqual({ dailyCap: "5", signatureThreshold: "6" });
  });

  it("keeps what the agent maintains, so a resubmission cannot pay a month twice or clear a halt", () => {
    const merged = mergeProfile(existing, submitted);
    expect(merged.salary).toMatchObject({ pending: "250000", lastPaid: "2026-11" });
    expect(merged.salaryOwed).toBe(existing.salary.proposed === submitted.salary.proposed ? "777" : submitted.salaryOwed);
    expect(merged.tick).toEqual(existing.tick);
    expect(merged.breaker).toEqual(existing.breaker);
    expect(merged.history).toEqual(existing.history);
  });

  it("takes the submitted history only while the agent has none", () => {
    const withHistory = profileSchema.parse({ ...valid, history: [["2026-09-01", "1", "import"]] });
    expect(mergeProfile(base, withHistory).history).toEqual(withHistory.history);
  });
  it("keeps the nonce and the proposals the agent holds", () => {
    const kept = { id: "salary-2026-11", kind: "salary-day-one" as const, amount: "1", payee, digest: `0x${"ab".repeat(32)}`, createdAt: 1, expiresAt: 2, status: "pending" as const, decidedAt: 0 };
    expect(mergeProfile({ ...existing, nonce: "9", proposals: [kept] }, { ...submitted, nonce: "0" })).toMatchObject({ nonce: "9", proposals: [kept] });
  });
  it("keeps the agent's private notes, so a resubmission neither resurrects nor drops one", () => {
    const mnote = privNote;
    const mode = { enabled: true, ak: "1", nk: "2", authHash: "3", ownerPk: "4", viewers: [] };
    const withNotes = profileSchema.parse({ ...valid, privateMode: { ...mode, notes: [mnote] } });
    const resubmitted = profileSchema.parse({ ...valid, privateMode: { ...mode, notes: [] } });
    expect(mergeProfile(withNotes, resubmitted).privateMode.notes).toEqual(withNotes.privateMode.notes);
  });
});

describe("tax dates", () => {
  it("round-trip and default to none for a profile submitted without them", () => {
    const more = profileSchema.parse({ ...valid, taxDates: ["2026-11-17", "2026-12-17"] });
    expect(decodeProfile(encodeProfile(more)).taxDates).toEqual(["2026-11-17", "2026-12-17"]);
    expect(decodeProfile(new TextEncoder().encode(JSON.stringify(valid))).taxDates).toEqual([]);
  });

  it.each([
    ["thirteen tax dates", { taxDates: Array.from({ length: 13 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`) }],
    ["a tax date that is not a date", { taxDates: ["17/11/2026"] }],
  ])("refuses %s", (_name, patch) => {
    expect(profileSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("is kept from the submission when the owner re-submits over an existing state", () => {
    const existing = profileSchema.parse({ ...valid, taxDates: ["2026-11-17"] });
    const submitted = profileSchema.parse({ ...valid, taxDates: ["2026-12-17"] });
    expect(mergeProfile(existing, submitted).taxDates).toEqual(["2026-12-17"]);
  });
});
