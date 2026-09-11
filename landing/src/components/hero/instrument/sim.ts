import { createRng, nextSeed } from "./rng";

export type Phase = "pouring" | "settling" | "sweeping" | "verdict" | "draining";

export interface Spout {
  x: number;
  opensAt: number;
  open: boolean;
}

export interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  swept: boolean;
  life: number; // ms remaining; only meaningful when swept
}

export interface SimState {
  phase: Phase;
  phaseElapsed: number;
  cycleElapsed: number;
  seed: number;
  columns: Float32Array; // height per column, 0 = bottom, 1 = rim
  drainFrom: Float32Array; // snapshot of columns at the start of draining
  grains: Grain[];
  spouts: Spout[];
  strickleX: number; // right edge of the strickle, only meaningful in sweeping/verdict/draining
  carried: number; // excess mass pushed ahead of the strickle
  reducedMotion: boolean;
  random: () => number;
}

/** Normalized coordinates: x and y in 0–1 over the canvas box, y grows downward. Spec §5.1. */
export const GEOMETRY = {
  bowlLeft: 0.18,
  bowlRight: 0.82,
  rim: 0.36,
  bottom: 0.86,
  spoutY: 0.22,
  spoutMinX: 0.24,
  spoutMaxX: 0.76,
  spoutMinGap: 0.12,
  strickleWidth: 0.84,
  strickleRestRight: 0.92,
  columns: 96,
  overfill: 1.18,
  maxGrains: 400,
} as const;

/** Milliseconds. Spec §5.2. */
export const TIMING = {
  spoutStagger: 400,
  settlingMax: 600,
  sweeping: 1100,
  verdict: 2400,
  draining: 800,
  sweptLife: 700,
} as const;

// Physics constants, normalized units per second.
const GRAVITY = 3.0;
const EMIT_INTERVAL = 16; // ms between grains per open spout
const GRAIN_VOLUME = 0.14; // column-height units added per absorbed grain
const SLOPE_MAX = 0.015; // max height difference between neighbours after relaxation
const RELAX_PASSES = 2;
const SUBSTEP = 1000 / 60;

const BOWL_WIDTH = GEOMETRY.bowlRight - GEOMETRY.bowlLeft;
const DEPTH = GEOMETRY.bottom - GEOMETRY.rim;
const COLUMN_WIDTH = BOWL_WIDTH / GEOMETRY.columns;

export function columnX(i: number): number {
  return GEOMETRY.bowlLeft + (i + 0.5) * COLUMN_WIDTH;
}

function columnIndex(x: number): number {
  const i = Math.floor((x - GEOMETRY.bowlLeft) / COLUMN_WIDTH);
  return Math.max(0, Math.min(GEOMETRY.columns - 1, i));
}

export function surfaceY(state: SimState, x: number): number {
  return GEOMETRY.bottom - state.columns[columnIndex(x)] * DEPTH;
}

function pickSpouts(random: () => number): Spout[] {
  const count = random() < 0.5 ? 3 : 4;
  const xs: number[] = [];
  for (let tries = 0; tries < 200 && xs.length < count; tries++) {
    const x = GEOMETRY.spoutMinX + random() * (GEOMETRY.spoutMaxX - GEOMETRY.spoutMinX);
    if (xs.every((o) => Math.abs(o - x) >= GEOMETRY.spoutMinGap)) xs.push(x);
  }
  while (xs.length < count) {
    // Fallback: evenly spaced.
    const k = xs.length;
    xs.push(GEOMETRY.spoutMinX + ((k + 0.5) / count) * (GEOMETRY.spoutMaxX - GEOMETRY.spoutMinX));
  }
  xs.sort((a, b) => a - b);
  return xs.map((x, i) => ({ x, opensAt: i * TIMING.spoutStagger, open: false }));
}

export function createSim(seed: number, opts: { reducedMotion?: boolean } = {}): SimState {
  const random = createRng(seed);
  const state: SimState = {
    phase: "pouring",
    phaseElapsed: 0,
    cycleElapsed: 0,
    seed,
    columns: new Float32Array(GEOMETRY.columns),
    drainFrom: new Float32Array(GEOMETRY.columns),
    grains: [],
    spouts: pickSpouts(random),
    strickleX: GEOMETRY.strickleRestRight - GEOMETRY.strickleWidth, // fully off to the left
    carried: 0,
    reducedMotion: opts.reducedMotion === true,
    random,
  };
  if (state.reducedMotion) {
    state.phase = "verdict";
    state.columns.fill(1);
    state.strickleX = GEOMETRY.strickleRestRight;
    state.spouts = state.spouts.slice(0, 3).map((s) => ({ ...s, open: false }));
  }
  return state;
}

function absorb(state: SimState, x: number): void {
  state.columns[columnIndex(x)] += GRAIN_VOLUME;
}

/** Angle of repose: move mass from taller to shorter neighbours until slopes are gentle. */
function relax(columns: Float32Array): void {
  const n = columns.length;
  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    for (let i = 0; i < n - 1; i++) {
      const d = columns[i] - columns[i + 1];
      if (d > SLOPE_MAX) {
        const m = (d - SLOPE_MAX) / 2;
        columns[i] -= m;
        columns[i + 1] += m;
      } else if (-d > SLOPE_MAX) {
        const m = (-d - SLOPE_MAX) / 2;
        columns[i] += m;
        columns[i + 1] -= m;
      }
    }
  }
}

function averageHeight(columns: Float32Array): number {
  let s = 0;
  for (let i = 0; i < columns.length; i++) s += columns[i];
  return s / columns.length;
}

function emit(state: SimState, spout: Spout): void {
  if (state.grains.length >= GEOMETRY.maxGrains) return;
  const r = state.random;
  state.grains.push({
    x: spout.x + (r() - 0.5) * 0.03,
    y: GEOMETRY.spoutY,
    vx: (r() - 0.5) * 0.05,
    vy: 0.2,
    swept: false,
    life: 0,
  });
}

/** Integrate airborne grains over dt seconds; absorb falling grains, expire swept ones. */
function integrateGrains(state: SimState, dtSec: number, dtMs: number): void {
  const grains = state.grains;
  let write = 0;
  for (let i = 0; i < grains.length; i++) {
    const g = grains[i];
    g.vy += GRAVITY * dtSec;
    g.x += g.vx * dtSec;
    g.y += g.vy * dtSec;
    let keep = true;
    if (g.swept) {
      g.life -= dtMs;
      if (g.life <= 0 || g.y > 1.1) keep = false;
    } else if (g.x <= GEOMETRY.bowlLeft || g.x >= GEOMETRY.bowlRight) {
      keep = false; // missed the bowl; drop it
    } else if (g.y >= surfaceY(state, g.x)) {
      absorb(state, g.x);
      keep = false;
    }
    if (keep) grains[write++] = g;
  }
  grains.length = write;
}

function setPhase(state: SimState, phase: Phase): void {
  state.phase = phase;
  state.phaseElapsed = 0;
}

function substep(state: SimState, dtMs: number): void {
  const dtSec = dtMs / 1000;
  state.phaseElapsed += dtMs;

  switch (state.phase) {
    case "pouring": {
      state.cycleElapsed += dtMs;
      for (const spout of state.spouts) {
        spout.open = state.phaseElapsed >= spout.opensAt;
        if (!spout.open) continue;
        // Emit at EMIT_INTERVAL per open spout, proportionally to dt.
        const n = Math.max(1, Math.round(dtMs / EMIT_INTERVAL));
        for (let k = 0; k < n; k++) emit(state, spout);
      }
      integrateGrains(state, dtSec, dtMs);
      relax(state.columns);
      if (averageHeight(state.columns) >= GEOMETRY.overfill) {
        for (const spout of state.spouts) spout.open = false;
        setPhase(state, "settling");
      }
      break;
    }
    case "settling": {
      state.cycleElapsed += dtMs;
      integrateGrains(state, dtSec, dtMs);
      relax(state.columns);
      const airborne = state.grains.some((g) => !g.swept);
      if (!airborne || state.phaseElapsed >= TIMING.settlingMax) {
        state.grains = state.grains.filter((g) => g.swept);
        state.carried = 0;
        state.strickleX = 0.08;
        setPhase(state, "sweeping");
      }
      break;
    }
    case "sweeping": {
      // Task 4
      break;
    }
    case "verdict": {
      // Task 4
      break;
    }
    case "draining": {
      // Task 4
      break;
    }
  }
}

export function step(state: SimState, dtMs: number): void {
  if (state.reducedMotion) return;
  let remaining = Math.min(dtMs, 50);
  while (remaining > 0) {
    const h = Math.min(remaining, SUBSTEP);
    substep(state, h);
    remaining -= h;
  }
}

// Re-exported so Task 4 can derive the next cycle's seed without importing rng directly.
export { nextSeed };
