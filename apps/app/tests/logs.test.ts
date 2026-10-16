import { describe, expect, it } from "vitest";
import { parseLogsResponse } from "../src/chain/logs.ts";

const entry = { blockNumber: "0x404c1e3", logIndex: "0x15", timeStamp: "0x6ad17bb2", transactionHash: `0x${"ab".repeat(32)}`, topics: [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`, null, null], data: "0x00" };

describe("parseLogsResponse", () => {
  it("reads the explorer's hex fields and drops the null topic slots", () => {
    const { logs, truncated } = parseLogsResponse({ logs: [entry] });
    expect(logs[0]).toMatchObject({ blockNumber: 0x404c1e3n, logIndex: 0x15, timestamp: 0x6ad17bb2, data: "0x00" });
    expect(logs[0]?.topics).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it("carries the truncated flag", () => {
    expect(parseLogsResponse({ logs: [], truncated: true }).truncated).toBe(true);
  });

  it("accepts an empty list and refuses anything else", () => {
    expect(parseLogsResponse({ logs: [] }).logs).toEqual([]);
    expect(() => parseLogsResponse({ error: "unavailable" })).toThrow();
    expect(() => parseLogsResponse({ logs: [{ ...entry, transactionHash: "nope" }] })).toThrow();
    expect(() => parseLogsResponse(null)).toThrow();
  });
});
