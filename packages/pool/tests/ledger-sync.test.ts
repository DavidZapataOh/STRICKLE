// packages/pool/tests/ledger-sync.test.ts
import { describe, expect, it } from "vitest";
import { PoolLedger } from "../src/ledger.ts";
import { appendLogs } from "../src/ledger-sync.ts";

describe("appendLogs", () => {
  it("appends pairs in order and finds a commitment's leaf index", () => {
    const ledger = new PoolLedger();
    appendLogs(ledger, [{ index: 0, commitment0: 10n, commitment1: 11n }, { index: 2, commitment0: 12n, commitment1: 0n }]);
    expect(ledger.size).toBe(4);
    expect(ledger.find(10n)).toBe(0);
    expect(ledger.find(11n)).toBe(1);
    expect(ledger.find(12n)).toBe(2);
    expect(ledger.find(99n)).toBeUndefined();
  });

  it("refuses a gap in the event stream", () => {
    const ledger = new PoolLedger();
    expect(() => appendLogs(ledger, [{ index: 2, commitment0: 1n, commitment1: 2n }])).toThrow(/event gap at index 2/);
  });

  it("is idempotent for events it already holds", () => {
    const ledger = new PoolLedger();
    const logs = [{ index: 0, commitment0: 10n, commitment1: 11n }];
    appendLogs(ledger, logs);
    appendLogs(ledger, logs);
    expect(ledger.size).toBe(2);
  });
});
