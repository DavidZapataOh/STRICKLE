import { describe, expect, it } from "vitest";
import { expandRisk } from "../src/neighborhood.ts";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const NOW = 1_900_000_000;
const DAY = 86_400;
const base = { hops: 1 as const, windowSeconds: 90 * DAY, now: NOW, exempt: new Set<`0x${string}`>() };
const t = (from: number, to: number, ageDays = 1) => ({ from: a(from), to: a(to), timestamp: NOW - ageDays * DAY });

describe("bounded risk expansion", () => {
  it("marks blocked addresses as blocked at hop 0", () => {
    const result = expandRisk({ ...base, blocked: new Set([a(1)]), transfers: [] });
    expect(result.get(a(1))).toEqual({ risk: 2, hop: 0, via: a(1) });
    expect(result.size).toBe(1);
  });

  it("flags direct counterparties in either direction as elevated at hop 1", () => {
    const result = expandRisk({ ...base, blocked: new Set([a(1)]), transfers: [t(1, 2), t(3, 1)] });
    expect(result.get(a(2))).toEqual({ risk: 1, hop: 1, via: a(1) });
    expect(result.get(a(3))).toEqual({ risk: 1, hop: 1, via: a(1) });
  });

  it("ignores transfers outside the time window, including the future", () => {
    const result = expandRisk({ ...base, blocked: new Set([a(1)]), transfers: [t(1, 2, 91), { from: a(1), to: a(3), timestamp: NOW + 10 }] });
    expect(result.has(a(2))).toBe(false);
    expect(result.has(a(3))).toBe(false);
    expect(expandRisk({ ...base, blocked: new Set([a(1)]), transfers: [t(1, 2, 90)] }).has(a(2))).toBe(true);
  });

  it("never flags exempt infrastructure and does not pass risk through it", () => {
    const result = expandRisk({ ...base, hops: 2, exempt: new Set([a(9)]), blocked: new Set([a(1)]), transfers: [t(1, 9), t(9, 5)] });
    expect(result.has(a(9))).toBe(false);
    expect(result.has(a(5))).toBe(false);
  });

  it("reaches the second ring only when two hops are asked for", () => {
    const transfers = [t(1, 2), t(2, 3)];
    expect(expandRisk({ ...base, blocked: new Set([a(1)]), transfers }).has(a(3))).toBe(false);
    const result = expandRisk({ ...base, hops: 2, blocked: new Set([a(1)]), transfers });
    expect(result.get(a(3))).toEqual({ risk: 1, hop: 2, via: a(2) });
  });

  it("never downgrades a blocked address that neighbours another blocked address", () => {
    const result = expandRisk({ ...base, blocked: new Set([a(1), a(2)]), transfers: [t(1, 2)] });
    expect(result.get(a(2))?.risk).toBe(2);
    expect(result.get(a(1))?.risk).toBe(2);
  });

  it("keeps the nearest explanation when an address is reachable twice", () => {
    const result = expandRisk({ ...base, hops: 2, blocked: new Set([a(1)]), transfers: [t(1, 2), t(2, 3), t(1, 3)] });
    expect(result.get(a(3))).toEqual({ risk: 1, hop: 1, via: a(1) });
  });

  it("normalises address case", () => {
    const upper = (n: number) => `0x${a(n).slice(2).toUpperCase()}` as `0x${string}`;
    const result = expandRisk({ ...base, blocked: new Set([upper(0xab)]), transfers: [{ from: upper(0xab), to: upper(0xcd), timestamp: NOW - DAY }] });
    expect([...result.values()].map((entry) => entry.hop).sort()).toEqual([0, 1]);
  });

  it("handles no transfers and no blocked addresses", () => {
    expect(expandRisk({ ...base, blocked: new Set(), transfers: [t(1, 2)] }).size).toBe(0);
  });
});
