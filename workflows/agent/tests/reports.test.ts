// workflows/agent/tests/reports.test.ts
import { readFileSync } from "node:fs";
import { decodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { encodeNoticeReport, encodePrivateSpendReport, encodeSalaryReport, encodeTickReport } from "../enclave/reports.ts";

const vault = "0x00000000000000000000000000000000000000a1" as const;
const payee = "0x00000000000000000000000000000000000000b2" as const;
const salary = { vault, asset: 1, payee, amount: 1_000_000n, seen: 1_000_000n, next: 2n, ciphertext: "0x5a1a" as const };
const tick = { vault, next: 3n, ciphertext: "0x7171" as const };
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8").trim();

describe("reports", () => {
  it("encodes PAY_SALARY as (2, args) with the executor's tuple", () => {
    const [action, args] = decodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], encodeSalaryReport(salary));
    expect(action).toBe(2);
    const [v, asset, p, amount, seen, next, ciphertext] = decodeAbiParameters(
      [{ type: "address" }, { type: "uint8" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes" }],
      args,
    );
    expect([v.toLowerCase(), asset, p.toLowerCase(), amount, seen, next, ciphertext]).toEqual([vault, 1, payee, 1_000_000n, 1_000_000n, 2n, "0x5a1a"]);
  });

  it("encodes TICK as (3, args) with the executor's tuple", () => {
    const [action, args] = decodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], encodeTickReport(tick));
    expect(action).toBe(3);
    const [v, next, ciphertext] = decodeAbiParameters([{ type: "address" }, { type: "uint64" }, { type: "bytes" }], args);
    expect([v.toLowerCase(), next, ciphertext]).toEqual([vault, 3n, "0x7171"]);
  });

  it("matches the fixtures the Solidity executor decodes", () => {
    expect(encodeSalaryReport(salary)).toBe(fixture("salary-report.hex"));
    expect(encodeTickReport(tick)).toBe(fixture("tick-report.hex"));
  });
  it("encodes NOTICE as (4, args) and matches the fixture", () => {
    const input = { vault, id: 5n, sealed: "0xabcd" as const };
    const [action, args] = decodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], encodeNoticeReport(input));
    expect(action).toBe(4);
    const [v, id, sealed] = decodeAbiParameters([{ type: "address" }, { type: "uint64" }, { type: "bytes" }], args);
    expect([v.toLowerCase(), id, sealed]).toEqual([vault, 5n, "0xabcd"]);
    expect(encodeNoticeReport(input)).toBe(fixture("notice-report.hex"));
  });
  it("encodes PRIVATE_SPEND as (5, args) and matches the fixture", () => {
    const input = {
      vault,
      proof: "0xc0ffee" as const,
      inputs: { root: 1n, nullifiers: [2n, 3n] as [bigint, bigint], commitments: [4n, 5n] as [bigint, bigint], publicAmount: 300000n, recipient: 6n, asset: 1, timestamp: 7n, associationRoot: 0n, enc: [8n, 9n] as [bigint, bigint] },
      poolCiphertext: "0xe17e" as const,
      next: 4n,
      stateCiphertext: "0x5747" as const,
    };
    const [action] = decodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], encodePrivateSpendReport(input));
    expect(action).toBe(5);
    expect(encodePrivateSpendReport(input)).toBe(fixture("private-spend-report.hex"));
  });
});
