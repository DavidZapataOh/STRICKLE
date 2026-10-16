import { sealNotice } from "@strickle/agent/notices";
import { generateProverKey } from "@strickle/prover/sealed";
import { encodeAbiParameters, encodeEventTopics, getAddress, parseAbiItem, toHex } from "viem";
import { describe, expect, it } from "vitest";
import type { RawLog } from "../src/chain/logs.ts";
import { latestPlan, openedNotices } from "../src/chain/plan.ts";

const noticeEvent = parseAbiItem("event Notice(address indexed vault, uint64 indexed id, bytes sealedData)");
const vault = getAddress("0x00000000000000000000000000000000000000a1");
const otherVault = getAddress("0x00000000000000000000000000000000000000b2");
const master = new Uint8Array(32).fill(7);
const key = generateProverKey();

const plan = (asOf: string) => ({
  kind: "plan" as const, asOf,
  salary: { next: "2026-12-01", owed: "1000000", safeNow: "1000000", pending: "0", binding: "full" as const, aboveFloorBps: 9900, lastPaid: "2026-11", needsApproval: false, halted: false },
  proposals: [],
  cushion: { days: 42, floorDays: 14, targetDays: 42 },
  forecast: { floor: "280000", opening: "4000000", p10: ["1"], p50: ["2"], basis: "observed" as const },
  events: [],
  targets: { taxes: "0", payroll: "0", salary: "1000000", operating: "840000", emergency: "0" },
  rates: { taxBps: 1800 },
});
const salary = { kind: "salary" as const, month: "2026-11", paid: "1", pending: "0" };

const log = (forVault: typeof vault, id: bigint, sealed: Uint8Array): RawLog => ({
  blockNumber: id, logIndex: 0, timestamp: 1_800_000_000, transactionHash: `0x${id.toString(16).padStart(64, "0")}`,
  topics: encodeEventTopics({ abi: [noticeEvent], eventName: "Notice", args: { vault: forVault, id } }) as `0x${string}`[],
  data: encodeAbiParameters([{ type: "bytes" }], [toHex(sealed)]),
});
const seal = (forVault: typeof vault, id: bigint, notice: Parameters<typeof sealNotice>[4]) => log(forVault, id, sealNotice(master, key.publicKey, forVault, id, notice));

describe("openedNotices and latestPlan", () => {
  it("returns the newest plan and every valid notice newest first", () => {
    const logs = [seal(vault, 1n, plan("2026-11-01")), seal(vault, 2n, salary), seal(vault, 3n, plan("2026-11-02"))];
    expect(openedNotices(logs, key, vault).map((entry) => entry.id)).toEqual([3n, 2n, 1n]);
    expect(latestPlan(logs, key, vault)?.asOf).toBe("2026-11-02");
  });

  it("ignores a notice sealed to another vault or another id, garbage, and a payload that fails the schema", () => {
    const foreign = log(vault, 5n, sealNotice(master, key.publicKey, otherVault, 5n, plan("2026-12-31")));
    const wrongId = log(vault, 6n, sealNotice(master, key.publicKey, vault, 99n, plan("2026-12-30")));
    const garbage = log(vault, 7n, new Uint8Array(80).fill(3));
    const invalid = log(vault, 8n, sealNotice(master, key.publicKey, vault, 8n, { kind: "plan", asOf: "x" } as never));
    const good = seal(vault, 4n, plan("2026-11-03"));
    expect(latestPlan([foreign, wrongId, garbage, invalid, good], key, vault)?.asOf).toBe("2026-11-03");
    expect(openedNotices([foreign, wrongId, garbage, invalid], key, vault)).toEqual([]);
  });

  it("returns null without a plan and cannot be read with another key", () => {
    expect(latestPlan([], key, vault)).toBeNull();
    expect(latestPlan([seal(vault, 1n, salary)], key, vault)).toBeNull();
    expect(latestPlan([seal(vault, 1n, plan("2026-11-01"))], generateProverKey(), vault)).toBeNull();
  });

  it("looks at no more than the twelve newest notices", () => {
    const old = seal(vault, 1n, plan("2026-10-01"));
    const filler = Array.from({ length: 12 }, (_, i) => seal(vault, BigInt(i + 2), salary));
    expect(latestPlan([old, ...filler], key, vault)).toBeNull();
  });
});
