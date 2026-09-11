import { describe, expect, it } from "vitest";
import { GEOMETRY, createSim, step, columnX, surfaceY, type SimState } from "./sim";

/** Advance in fixed 16 ms ticks until `pred` holds or `maxMs` elapses. Returns ms spent. */
function advanceUntil(state: SimState, pred: (s: SimState) => boolean, maxMs: number): number {
  let t = 0;
  while (t < maxMs && !pred(state)) {
    step(state, 16);
    t += 16;
  }
  return t;
}

describe("createSim", () => {
  it("starts pouring with 3 or 4 sorted, well-spaced spouts and an empty bowl", () => {
    const s = createSim(1);
    expect(s.phase).toBe("pouring");
    expect(s.columns.length).toBe(GEOMETRY.columns);
    expect(Array.from(s.columns).every((h) => h === 0)).toBe(true);
    expect([3, 4]).toContain(s.spouts.length);
    for (let i = 1; i < s.spouts.length; i++) {
      expect(s.spouts[i].x - s.spouts[i - 1].x).toBeGreaterThanOrEqual(GEOMETRY.spoutMinGap - 1e-9);
    }
    for (const sp of s.spouts) {
      expect(sp.x).toBeGreaterThanOrEqual(GEOMETRY.spoutMinX);
      expect(sp.x).toBeLessThanOrEqual(GEOMETRY.spoutMaxX);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = createSim(99);
    const b = createSim(99);
    for (let i = 0; i < 120; i++) {
      step(a, 16);
      step(b, 16);
    }
    expect(Array.from(a.columns)).toEqual(Array.from(b.columns));
    expect(a.grains.length).toBe(b.grains.length);
    expect(a.phase).toBe(b.phase);
  });
});

describe("pouring", () => {
  it("opens spouts in stagger order and emits grains", () => {
    const s = createSim(3);
    step(s, 16);
    expect(s.spouts[0].open).toBe(true);
    expect(s.spouts[1].open).toBe(false);
    advanceUntil(s, (x) => x.spouts[1].open, 1000);
    expect(s.spouts[1].open).toBe(true);
    expect(s.grains.length).toBeGreaterThan(0);
  });

  it("ends within 8 s with the bowl overfilled, then settles", () => {
    const s = createSim(5);
    const t = advanceUntil(s, (x) => x.phase !== "pouring", 8000);
    expect(t).toBeLessThan(8000);
    expect(s.phase).toBe("settling");
    expect(Math.max(...Array.from(s.columns))).toBeGreaterThan(1);
    expect(s.spouts.every((sp) => !sp.open)).toBe(true);
    const avg = Array.from(s.columns).reduce((a, b) => a + b, 0) / GEOMETRY.columns;
    expect(avg).toBeGreaterThanOrEqual(GEOMETRY.overfill - 0.05);
  });

  it("never exceeds the grain budget", () => {
    const s = createSim(8);
    for (let i = 0; i < 400; i++) {
      step(s, 16);
      expect(s.grains.length).toBeLessThanOrEqual(GEOMETRY.maxGrains);
    }
  });
});

describe("geometry helpers", () => {
  it("maps column centers inside the bowl and surface to the rim at height 1", () => {
    expect(columnX(0)).toBeGreaterThan(GEOMETRY.bowlLeft);
    expect(columnX(GEOMETRY.columns - 1)).toBeLessThan(GEOMETRY.bowlRight);
    const s = createSim(1);
    s.columns.fill(1);
    expect(surfaceY(s, 0.5)).toBeCloseTo(GEOMETRY.rim, 6);
    s.columns.fill(0);
    expect(surfaceY(s, 0.5)).toBeCloseTo(GEOMETRY.bottom, 6);
  });
});
