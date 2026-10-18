import { describe, expect, it } from "vitest";
import { type PayerEntry, categoryId, entryHash, loadPayers, parsePayers, payersForChain } from "../src/dataset.ts";

const good = { chainId: 1, address: "0x370DE27fdb7D1Ff1e1BaA7D11c5820a324Cf623C", name: "A rail", category: "payment-rail", source: "https://example.org/a", retrieved: "2026-10-15" };

describe("the bundled dataset", () => {
  const entries = loadPayers();

  it("parses and has no duplicate chain and address", () => {
    expect(entries.length).toBeGreaterThanOrEqual(7);
    expect(new Set(entries.map((entry) => `${entry.chainId}:${entry.address}`)).size).toBe(entries.length);
  });

  it("gives every entry an https source and a retrieval date that is not in the future", () => {
    for (const entry of entries) {
      expect(entry.source).toMatch(/^https:\/\//);
      expect(Date.parse(entry.retrieved)).toBeLessThanOrEqual(Date.now());
    }
  });

  it("selects the entries of one chain only", () => {
    expect(payersForChain(entries, 42161).map((entry) => entry.name).sort()).toEqual(["Arbitrum DAO Treasury", "Request Network ERC20FeeProxy 0.2.0"]);
    expect(payersForChain(entries, 5042002)).toEqual([]);
  });
});

describe("parsePayers", () => {
  it("accepts a valid entry and keeps an optional note", () => {
    expect(parsePayers([good])).toEqual([good]);
    expect(parsePayers([{ ...good, note: "n" }])[0]?.note).toBe("n");
  });

  it.each([
    ["a missing source", { ...good, source: undefined }],
    ["an http source", { ...good, source: "http://example.org" }],
    ["a malformed address", { ...good, address: "0x1234" }],
    ["a lowercase address", { ...good, address: good.address.toLowerCase() }],
    ["an unknown category", { ...good, category: "bank" }],
    ["a future retrieval date", { ...good, retrieved: "2999-01-01" }],
    ["a malformed date", { ...good, retrieved: "15/10/2026" }],
    ["an unknown field", { ...good, price: 1 }],
    ["an empty name", { ...good, name: " " }],
    ["a bad chain id", { ...good, chainId: 0 }],
  ])("rejects %s, naming the entry", (_, entry) => {
    expect(() => parsePayers([entry])).toThrow(/entry 0/);
  });

  it("rejects a duplicate chain and address and anything that is not a list", () => {
    expect(() => parsePayers([good, good])).toThrow(/duplicate/);
    expect(() => parsePayers({})).toThrow(/list/);
  });
});

describe("encoding", () => {
  it("numbers categories like the Solidity enum", () => {
    expect(["payroll", "payment-rail", "dao", "grants"].map((category) => categoryId(category as never))).toEqual([0, 1, 2, 3]);
  });

  it("hashes the same entry the same way whatever the key order, and different entries differently", () => {
    const a = parsePayers([good])[0] as PayerEntry;
    const shuffled = parsePayers([{ retrieved: good.retrieved, source: good.source, category: good.category, name: good.name, address: good.address, chainId: good.chainId }])[0] as PayerEntry;
    expect(entryHash(a)).toBe(entryHash(shuffled));
    expect(entryHash({ ...a, name: "Another" })).not.toBe(entryHash(a));
    expect(entryHash(a)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
