import { describe, expect, it } from "vitest";
import { layoutTimeline } from "../src/home/timeline.ts";

const events = [
  { date: "2026-11-01", kind: "salary" as const, amount: "1800000000" },
  { date: "2026-11-17", kind: "tax" as const, amount: null },
  { date: "2027-02-01", kind: "salary" as const, amount: "1800000000" },
];
const weeks = (n: number, from = 900_000_000) => Array.from({ length: n }, (_, i) => String(from + i * 50_000_000));
const forecast = { floor: "280000000", opening: "800000000", p10: weeks(13, 500_000_000), p50: weeks(13) };
const input = { asOf: "2026-11-01", days: 60, events, forecast };
const numbers = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const xs = (path: string) => [...path.matchAll(/[ML]([\d.]+) /g)].map((match) => Number(match[1]));

describe("layoutTimeline", () => {
  it("places stakes by day and drops the ones outside the window", () => {
    const { stakes } = layoutTimeline(input);
    expect(stakes.map((stake) => stake.date)).toEqual(["2026-11-01", "2026-11-17"]);
    expect(stakes[0]?.x).toBe(0);
    expect(stakes[1]?.x).toBeCloseTo((16 / 60) * 100, 1);
    expect(stakes.map((stake) => stake.id)).toEqual([1, 2]);
  });

  it("puts stakes of the same week on different lanes so their numbers never overlap", () => {
    const crowded = layoutTimeline({ ...input, events: [events[0]!, { date: "2026-11-02", kind: "payroll", amount: "1" }, { date: "2026-11-03", kind: "tax", amount: null }] });
    expect(crowded.stakes.map((stake) => stake.lane)).toEqual([0, 1, 2]);
    expect(layoutTimeline(input).stakes.map((stake) => stake.lane)).toEqual([0, 0]);
  });

  it("starts at today's balance and stops on the last day of the window, however many weeks the forecast has", () => {
    const { p50 } = layoutTimeline(input);
    const points = xs(p50);
    expect(points[0]).toBe(0);
    expect(points[points.length - 1]).toBe(100);
    expect(points).toHaveLength(1 + 8 + 1);
    expect(points).toEqual([...points].sort((a, b) => a - b));
  });

  it("interpolates the value on the last day between the two weeks that straddle it", () => {
    const flat = layoutTimeline({ ...input, forecast: { floor: "0", opening: "0", p10: weeks(13, 0), p50: weeks(13, 0) } });
    expect(flat.empty).toBe(false);
    const last = flat.p50.split(" L").pop() ?? "";
    expect(Number(last.split(" ")[0])).toBe(100);
  });

  it("does not repeat the window's end when the forecast stops short of it", () => {
    const short = layoutTimeline({ ...input, forecast: { floor: "1", opening: "1", p10: weeks(4), p50: weeks(4) } });
    expect(xs(short.p50)).toHaveLength(1 + 4);
  });

  it("keeps every coordinate inside the box, whatever the values", () => {
    const wild = layoutTimeline({ ...input, forecast: { floor: "5", opening: "900000000000", p10: ["-900000000000", "7"], p50: ["900000000000", "-3"] } });
    expect(wild.floorY).toBeGreaterThanOrEqual(0);
    expect(wild.floorY).toBeLessThanOrEqual(40);
    for (const path of [wild.p50, wild.p10, wild.band]) {
      for (const number of numbers(path.replace(/[A-Z]/g, " "))) {
        expect(number).toBeGreaterThanOrEqual(0);
        expect(number).toBeLessThanOrEqual(100);
      }
    }
  });

  it("draws the typical path above the cautious one", () => {
    const layout = layoutTimeline(input);
    const lastY = (path: string) => Number(path.split(" ").pop());
    expect(lastY(layout.p50)).toBeLessThan(lastY(layout.p10));
  });

  it("reports the balances on the last day for the text alternative", () => {
    const { end } = layoutTimeline({ ...input, forecast: { floor: "0", opening: "0", p10: weeks(13, 0), p50: weeks(13, 100_000_000) } });
    expect(end?.low).toBeGreaterThan(0n);
    expect(end?.mid).toBeGreaterThan(end?.low ?? 0n);
    expect(layoutTimeline({ ...input, forecast: { floor: "0", opening: "0", p10: [], p50: [] } }).end).toBeNull();
  });

  it("handles a flat forecast and no points", () => {
    const flat = layoutTimeline({ ...input, forecast: { floor: "100", opening: "100", p10: ["100", "100"], p50: ["100", "100"] } });
    expect(Number.isFinite(flat.floorY)).toBe(true);
    expect(flat.empty).toBe(false);
    const none = layoutTimeline({ ...input, forecast: { floor: "100", opening: "100", p10: [], p50: [] } });
    expect(none.empty).toBe(true);
    expect(none.p50).toBe("");
    expect(none.stakes).toHaveLength(2);
  });
});
