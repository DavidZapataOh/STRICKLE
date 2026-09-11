import { describe, expect, it } from "vitest";
import { GEOMETRY, createSim, step, columnX, surfaceY, spoutAt, type SimState } from "./sim";

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

describe("sweeping and verdict", () => {
  it("levels every column to the rim and reaches verdict", () => {
    const s = createSim(11);
    advanceUntil(s, (x) => x.phase === "sweeping", 9000);
    expect(s.phase).toBe("sweeping");
    const t = advanceUntil(s, (x) => x.phase === "verdict", 2000);
    expect(t).toBeLessThan(2000);
    for (const h of Array.from(s.columns)) expect(Math.abs(h - 1)).toBeLessThan(1e-6);
    expect(s.strickleX).toBeCloseTo(GEOMETRY.strickleRestRight, 6);
  });

  it("spawns swept grains while sweeping and lets them expire", () => {
    const s = createSim(12);
    advanceUntil(s, (x) => x.phase === "sweeping", 9000);
    let sawSwept = false;
    advanceUntil(
      s,
      (x) => {
        if (x.grains.some((g) => g.swept)) sawSwept = true;
        return x.phase === "verdict";
      },
      2000,
    );
    expect(sawSwept).toBe(true);
    for (let i = 0; i < 25; i++) step(s, 40); // 1 s; step caps each call at 50 ms
    expect(s.grains.length).toBe(0);
  });

  it("freezes cycleElapsed during verdict", () => {
    const s = createSim(13);
    advanceUntil(s, (x) => x.phase === "verdict", 12000);
    const frozen = s.cycleElapsed;
    for (let i = 0; i < 10; i++) step(s, 40);
    expect(s.cycleElapsed).toBe(frozen);
  });
});

describe("draining and the next cycle", () => {
  it("empties the bowl, slides the strickle out, then starts a new cycle with a new seed", () => {
    const s = createSim(21);
    const firstSeed = s.seed;
    const firstSpouts = s.spouts.map((sp) => sp.x);
    advanceUntil(s, (x) => x.phase === "draining", 14000);
    expect(s.phase).toBe("draining");
    for (let i = 0; i < 10; i++) step(s, 40); // 400 ms into draining
    expect(Math.max(...Array.from(s.columns))).toBeLessThan(1);
    expect(s.strickleX).toBeGreaterThan(GEOMETRY.strickleRestRight);
    advanceUntil(s, (x) => x.phase === "pouring", 2000);
    expect(s.phase).toBe("pouring");
    expect(s.seed).not.toBe(firstSeed);
    expect(s.cycleElapsed).toBe(0);
    expect(Array.from(s.columns).every((h) => h === 0)).toBe(true);
    expect(s.spouts.map((sp) => sp.x)).not.toEqual(firstSpouts);
  });
});

describe("reduced motion", () => {
  it("starts levelled in verdict and never changes", () => {
    const s = createSim(4, { reducedMotion: true });
    expect(s.phase).toBe("verdict");
    expect(s.spouts.length).toBe(3);
    expect(Array.from(s.columns).every((h) => h === 1)).toBe(true);
    expect(s.strickleX).toBe(GEOMETRY.strickleRestRight);
    const before = Array.from(s.columns);
    step(s, 5000);
    expect(s.phase).toBe("verdict");
    expect(Array.from(s.columns)).toEqual(before);
    expect(s.grains.length).toBe(0);
  });
});

describe("spoutAt", () => {
  it("finds a spout within tolerance and inside the spout band", () => {
    const s = createSim(6);
    const sp = s.spouts[1];
    expect(spoutAt(s, sp.x + 0.01, GEOMETRY.spoutY, 0.02)).toBe(1);
    expect(spoutAt(s, sp.x + 0.03, GEOMETRY.spoutY, 0.02)).toBeNull();
    expect(spoutAt(s, sp.x, 0.5, 0.02)).toBeNull();
    expect(spoutAt(s, sp.x, 0.10, 0.02)).toBeNull();
  });
});

describe("pickSpouts fallback", () => {
  it("keeps the minimum gap when random placement stalls, for every seed", () => {
    // Brute-force check: pickSpouts's rejection-sampling loop can stall for some
    // seeds (a run of random() values that keeps landing candidates too close
    // together), forcing the fallback branch. We can't inject a stubbed random()
    // into pickSpouts directly (draining reseeds state.random right before calling
    // it, overwriting any stub set on the SimState), so instead we sweep seeds and
    // assert the invariant the fallback is responsible for preserving: spouts stay
    // sorted, in range, and respect the minimum gap, for every seed.
    for (let seed = 1; seed <= 5000; seed++) {
      const s = createSim(seed);
      for (let i = 1; i < s.spouts.length; i++) {
        expect(s.spouts[i].x - s.spouts[i - 1].x).toBeGreaterThanOrEqual(GEOMETRY.spoutMinGap - 1e-9);
      }
      for (const sp of s.spouts) {
        expect(sp.x).toBeGreaterThanOrEqual(GEOMETRY.spoutMinX);
        expect(sp.x).toBeLessThanOrEqual(GEOMETRY.spoutMaxX);
      }
    }
  });
});
