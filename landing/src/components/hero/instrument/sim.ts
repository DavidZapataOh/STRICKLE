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
const EMIT_INTERVAL = 8; // ms between grains per open spout
const GRAIN_VOLUME = 0.045; // column-height units added per absorbed grain, spread over 3 columns in absorb()
// Tuned (with EMIT_INTERVAL, GRAIN_VOLUME and RELAX_PASSES above) so a heap under a
// spout can't out-race relax(): measured over seeds 1..200, the max column height
// during pouring/settling stays below the spout-mouth height (1.28) with margin, and
// pouring still finishes well inside the 8 s budget. See sim.test.ts "heap height".
const SLOPE_MAX = 0.0002; // max height difference between neighbours after relaxation
const RELAX_PASSES = 60;
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
  if (xs.length < count) {
    // Rejection sampling stalled: discard the partial picks and fall back to
    // evenly spaced positions for all `count` spouts so the min-gap invariant holds.
    xs.length = 0;
    for (let k = 0; k < count; k++) {
      xs.push(GEOMETRY.spoutMinX + ((k + 0.5) / count) * (GEOMETRY.spoutMaxX - GEOMETRY.spoutMinX));
    }
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

/**
 * Spread a grain's volume over its landing column and its two neighbours
 * (50 / 25 / 25) instead of dumping it all in one column, so a heap under a
 * spout can't spike past the spout mouths faster than relax() can level it.
 * Clamped at the array ends: a missing neighbour's share goes to the centre
 * column instead, so no volume is lost.
 */
function absorb(state: SimState, x: number): void {
  const columns = state.columns;
  const n = columns.length;
  const i = columnIndex(x);
  const side = GRAIN_VOLUME * 0.25;
  let center = GRAIN_VOLUME * 0.5;
  if (i - 1 >= 0) columns[i - 1] += side;
  else center += side;
  if (i + 1 <= n - 1) columns[i + 1] += side;
  else center += side;
  columns[i] += center;
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

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeIn(t: number): number {
  return t * t;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Push excess into swept grains flying right and up, capped by the grain budget. */
function spawnSwept(state: SimState, x: number, volume: number): void {
  const r = state.random;
  const n = Math.min(Math.round(volume / GRAIN_VOLUME), GEOMETRY.maxGrains - state.grains.length);
  for (let k = 0; k < n; k++) {
    state.grains.push({
      x,
      y: GEOMETRY.rim - 0.01,
      vx: 0.35 + r() * 0.25,
      vy: -(0.25 + r() * 0.2),
      swept: true,
      life: TIMING.sweptLife,
    });
  }
}

/** The strickle's right edge has reached `right`: level every column behind it. */
function levelBehind(state: SimState, right: number): void {
  for (let i = 0; i < GEOMETRY.columns; i++) {
    const cx = columnX(i);
    if (cx >= right) break;
    const h = state.columns[i];
    if (h > 1) {
      const excess = h - 1;
      state.columns[i] = 1;
      state.carried += excess;
      // Only half the swept excess is rendered as flying grains, deliberately,
      // to keep the sweep visually light; the full excess still feeds `carried`.
      spawnSwept(state, cx, excess * 0.5);
    } else if (h < 1 && state.carried > 0) {
      const fill = Math.min(state.carried, 1 - h);
      state.columns[i] = h + fill;
      state.carried -= fill;
    }
  }
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
      state.cycleElapsed += dtMs;
      const t = clamp01(state.phaseElapsed / TIMING.sweeping);
      state.strickleX = 0.08 + (GEOMETRY.strickleRestRight - 0.08) * easeInOut(t);
      levelBehind(state, state.strickleX);
      integrateGrains(state, dtSec, dtMs);
      if (t >= 1) {
        state.columns.fill(1); // exactly levelled, spec §5.2
        state.carried = 0;
        state.strickleX = GEOMETRY.strickleRestRight;
        setPhase(state, "verdict");
      }
      break;
    }
    case "verdict": {
      integrateGrains(state, dtSec, dtMs); // lets swept grains finish falling
      if (state.phaseElapsed >= TIMING.verdict) {
        state.drainFrom.set(state.columns);
        setPhase(state, "draining");
      }
      break;
    }
    case "draining": {
      const t = clamp01(state.phaseElapsed / TIMING.draining);
      const k = 1 - easeIn(t);
      for (let i = 0; i < GEOMETRY.columns; i++) state.columns[i] = state.drainFrom[i] * k;
      state.strickleX = GEOMETRY.strickleRestRight + 1.0 * easeIn(t);
      integrateGrains(state, dtSec, dtMs);
      if (t >= 1) {
        const seed = nextSeed(state.seed);
        state.seed = seed;
        state.random = createRng(seed);
        state.columns.fill(0);
        state.grains = [];
        state.spouts = pickSpouts(state.random);
        state.strickleX = GEOMETRY.strickleRestRight - GEOMETRY.strickleWidth;
        state.carried = 0;
        state.cycleElapsed = 0;
        setPhase(state, "pouring");
      }
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

/** Index of the spout under (x, y), or null. The hit band is y in [0.14, rim]. Spec §5.3. */
export function spoutAt(state: SimState, x: number, y: number, toleranceX: number): number | null {
  if (y < 0.14 || y > GEOMETRY.rim) return null;
  for (let i = 0; i < state.spouts.length; i++) {
    if (Math.abs(state.spouts[i].x - x) <= toleranceX) return i;
  }
  return null;
}
