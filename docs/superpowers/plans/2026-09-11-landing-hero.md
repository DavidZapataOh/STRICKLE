# Landing Hero «El rasero animado» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the STRICKLE landing hero: header, text column, and a procedural canvas «instrument» where suppliers pour grain into a measure and a brass strickle levels it to the legal threshold, ending on the Compliant verdict.

**Architecture:** A pure, seeded simulation module (`sim.ts`) drives a state machine (pouring → settling → sweeping → verdict → draining) over a 96-column heightfield plus airborne grains. A stateless renderer (`draw.ts`) paints any `SimState` to a Canvas 2D context. A client component (`Instrument.tsx`) owns the rAF loop, sizing, pause/resume, reduced-motion, and hover labels; everything else in the hero is server-rendered.

**Tech Stack:** Next.js 16.3 (App Router, `src/`), React 19, TypeScript 5, Tailwind v4 (`@theme inline`), `next/font/google`, Vitest for the pure modules. No runtime dependencies added.

**Spec:** `docs/superpowers/specs/2026-09-11-landing-hero-design.md` (repo root). Read it first; every measurement and string below comes from it.

## Global Constraints

- All work happens in `landing/`. Run every command from `landing/` unless stated otherwise. Git commits run from the repo root `STRICKLE/`.
- Copy is English and must match spec §4 character for character (including `16 %` with a space and the `·` separators).
- Colors only via the tokens of spec §6.1. Brass (`--accent`) appears exactly once in the view: the strickle bar inside the canvas. The header lockup is Steel only.
- Fonts: Bitter 700/800/700-italic, IBM Plex Sans 400/500/600, IBM Plex Mono 400/500, via `next/font/google`, exposed as `--font-bitter`, `--font-plex-sans`, `--font-plex-mono`.
- Light mode always: `<html data-theme="light">`.
- Links and buttons without a destination point to `#`. No new pages.
- No gradients, glows, shadows, blur, 3D, locks, or shields.
- Respect `prefers-reduced-motion: reduce`: no loop, final levelled state, no entrance animation.
- No horizontal scroll from 360 px up. Focus ring 2 px Bronze, 2 px offset.
- The only new dev dependency is `vitest`.
- Commit messages end with the two attribution lines shown in Task 1 Step 8; keep them on every commit.

---

## File map

| Path (under `landing/`) | Responsibility |
|---|---|
| `src/app/layout.tsx` | Fonts, `lang="en"`, `data-theme="light"`, metadata |
| `src/app/globals.css` | Tokens, Tailwind theme mapping, reset, focus ring, entrance reveal |
| `src/app/page.tsx` | `<SiteHeader />` + `<Hero />` |
| `src/components/site/Wordmark.tsx` | Inline SVG mark + STRICKLE wordmark |
| `src/components/site/SiteHeader.tsx` | 68 px header, nav, primary button |
| `src/components/hero/Hero.tsx` | Section grid, text column, footer rail, mounts `<Instrument />` |
| `src/components/hero/Instrument.tsx` | Client: canvas loop, sizing, pause, reduced motion, hover labels |
| `src/components/hero/Verdict.tsx` | Proving / Compliant block |
| `src/components/hero/instrument/rng.ts` | Seeded RNG |
| `src/components/hero/instrument/sim.ts` | Simulation state machine (pure) |
| `src/components/hero/instrument/draw.ts` | Canvas renderer (pure over a context) |
| `src/components/hero/instrument/rng.test.ts`, `sim.test.ts` | Vitest |
| `vitest.config.ts` | Test runner config |
| `public/brand/strickle-mark.svg` | Brand symbol asset |

---

### Task 1: Tokens, fonts, and page skeleton

**Files:**
- Modify: `src/app/globals.css` (replace whole file)
- Modify: `src/app/layout.tsx` (replace whole file)
- Modify: `src/app/page.tsx` (replace whole file)
- Create: `public/brand/strickle-mark.svg` (copy)
- Delete: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`

**Interfaces:**
- Produces: CSS custom properties `--ground --panel --edge --ink --ink-muted --accent --accent-text --focus --ok --ok-bg`; Tailwind colors `ground panel edge ink ink-muted accent accent-text ok ok-bg`; Tailwind fonts `font-display font-body font-mono`; utility classes `.reveal` and `.reveal-delay-1..3`; font CSS variables listed in Global Constraints.

- [ ] **Step 1: Copy the brand mark and remove scaffold assets**

Run from `landing/`:

```bash
mkdir -p public/brand && cp ~/templo/midnight/brand/strickle-mark.svg public/brand/strickle-mark.svg && rm public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg && ls public public/brand
```

Expected: `public` contains `brand` and `favicon.ico` only; `public/brand` contains `strickle-mark.svg`.

- [ ] **Step 2: Replace `src/app/globals.css`**

```css
@import "tailwindcss";

/* Tokens: BRANDING.md §6, copied literally. */
:root {
  --strickle-steel: #171a1f;
  --strickle-brass: #ab842b;
  --strickle-brass-light: #c9a24d; /* only on dark grounds */
  --strickle-bronze: #7a5a14;
  --strickle-silver: #7c8794;
  --strickle-zinc: #eef0f3;

  --ground: var(--strickle-zinc);
  --panel: #ffffff;
  --edge: #d3d8df;
  --ink: var(--strickle-steel);
  --ink-muted: #5b6470;
  --accent: var(--strickle-brass);
  --accent-text: var(--strickle-bronze);
  --focus: var(--strickle-bronze);

  --ok: #1b6b44;
  --ok-bg: #e7f3ec;
  --bad: #a6291f;
  --bad-bg: #fbe6e3;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #101216;
    --panel: var(--strickle-steel);
    --edge: #2a2f37;
    --ink: var(--strickle-zinc);
    --ink-muted: #a3aab4;
    --accent: var(--strickle-brass-light);
    --accent-text: var(--strickle-brass-light);
    --focus: var(--strickle-brass-light);
    --ok: #7fd1a0;
    --ok-bg: #1b2a21;
    --bad: #f08c82;
    --bad-bg: #2e1a18;
  }
}
:root[data-theme="dark"] {
  --ground: #101216;
  --panel: var(--strickle-steel);
  --edge: #2a2f37;
  --ink: var(--strickle-zinc);
  --ink-muted: #a3aab4;
  --accent: var(--strickle-brass-light);
  --accent-text: var(--strickle-brass-light);
  --focus: var(--strickle-brass-light);
  --ok: #7fd1a0;
  --ok-bg: #1b2a21;
  --bad: #f08c82;
  --bad-bg: #2e1a18;
}

@theme inline {
  --color-ground: var(--ground);
  --color-panel: var(--panel);
  --color-edge: var(--edge);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-accent: var(--accent);
  --color-accent-text: var(--accent-text);
  --color-ok: var(--ok);
  --color-ok-bg: var(--ok-bg);
  --font-display: var(--font-bitter), Georgia, "Times New Roman", serif;
  --font-body: var(--font-plex-sans), "Helvetica Neue", Arial, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, Menlo, monospace;
}

html {
  background: var(--ground);
  color: var(--ink);
  font-family: var(--font-body);
  overflow-x: hidden;
}

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
}

:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Entrance reveal: opacity + 18 px, 750 ms, staggered. Spec §6.3. */
.reveal {
  opacity: 0;
  transform: translateY(18px);
  animation: reveal 750ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
}
.reveal-delay-1 { animation-delay: 80ms; }
.reveal-delay-2 { animation-delay: 160ms; }
.reveal-delay-3 { animation-delay: 240ms; }

@keyframes reveal {
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    animation: none;
  }
}
```

- [ ] **Step 3: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Bitter, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const bitter = Bitter({
  variable: "--font-bitter",
  subsets: ["latin"],
  weight: ["700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "STRICKLE — Prove the threshold. Keep the recipe.",
  description:
    "Confidential product passport. Prove a battery meets the EU recycled-content minimum without revealing suppliers, quantities or prices.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${bitter.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

Note: Bitter's italic subset covers weight 700; requesting `weight: ["700","800"]` with `style: ["normal","italic"]` asks Google for both styles at both weights. Bitter has an 800 italic too, so this resolves.

- [ ] **Step 4: Replace `src/app/page.tsx` with a placeholder that proves the tokens work**

```tsx
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-start gap-4 p-8">
      <p className="font-body text-[12px] font-medium uppercase tracking-[0.10em] text-ink-muted">
        Confidential product passport · Batteries
      </p>
      <h1 className="font-display text-[48px] font-extrabold leading-none text-ink">
        Prove the threshold. <em className="font-bold">Keep the recipe.</em>
      </h1>
      <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted">
        Regulation (EU) 2023/1542
      </p>
      <span className="inline-block h-1.5 w-40 bg-accent" />
    </main>
  );
}
```

- [ ] **Step 5: Build and lint**

Run: `npm run lint && npm run build`
Expected: lint prints nothing; build ends with `✓ Generating static pages` and lists route `/`.

- [ ] **Step 6: Visual check**

Run `npm run dev` in the background, open `http://localhost:3000`. Expect: Zinc ground, a slab headline with the second sentence in italic, a mono label, and a brass bar. Stop the dev server.

- [ ] **Step 7: Commit**

From `STRICKLE/`:

```bash
git add landing/public landing/src/app
git commit -m "feat(landing): brand tokens, fonts and page skeleton

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuEGNWtYTWArFDJnXTSYij"
```

---

### Task 2: Vitest and the seeded RNG

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` script)
- Create: `src/components/hero/instrument/rng.ts`
- Test: `src/components/hero/instrument/rng.test.ts`

**Interfaces:**
- Produces: `createRng(seed: number): () => number` returning floats in `[0, 1)`; `nextSeed(seed: number): number` (LCG step, unsigned 32-bit).

- [ ] **Step 1: Install Vitest and add the script**

Run from `landing/`:

```bash
npm install -D vitest@^3 && node -e "const p=require('./package.json');p.scripts.test='vitest run';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')" && grep '"test"' package.json
```

Expected: `"test": "vitest run"`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Write the failing test `src/components/hero/instrument/rng.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createRng, nextSeed } from "./rng";

describe("createRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = createRng(1)();
    const b = createRng(2)();
    expect(a).not.toBe(b);
  });

  it("stays within [0, 1)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("nextSeed", () => {
  it("is deterministic and changes the seed", () => {
    expect(nextSeed(5)).toBe(nextSeed(5));
    expect(nextSeed(5)).not.toBe(5);
    expect(Number.isInteger(nextSeed(5))).toBe(true);
    expect(nextSeed(5)).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module './rng'` (or equivalent).

- [ ] **Step 5: Create `src/components/hero/instrument/rng.ts`**

```ts
/** mulberry32: small, fast, seedable. Good enough for decorative motion. */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear congruential step used to derive the next cycle's seed. */
export function nextSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: 4 tests pass.

- [ ] **Step 7: Commit**

From `STRICKLE/`:

```bash
git add landing/package.json landing/package-lock.json landing/vitest.config.ts landing/src/components/hero/instrument/rng.ts landing/src/components/hero/instrument/rng.test.ts
git commit -m "test(landing): add Vitest and seeded RNG for the instrument

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuEGNWtYTWArFDJnXTSYij"
```

---

### Task 3: Simulation, part 1 — geometry, pouring, settling

**Files:**
- Create: `src/components/hero/instrument/sim.ts`
- Test: `src/components/hero/instrument/sim.test.ts`

**Interfaces:**
- Consumes: `createRng`, `nextSeed` from `./rng`.
- Produces (all exported from `sim.ts`):

```ts
export type Phase = "pouring" | "settling" | "sweeping" | "verdict" | "draining";
export interface Spout { x: number; opensAt: number; open: boolean }
export interface Grain { x: number; y: number; vx: number; vy: number; swept: boolean; life: number }
export interface SimState {
  phase: Phase; phaseElapsed: number; cycleElapsed: number; seed: number;
  columns: Float32Array; drainFrom: Float32Array; grains: Grain[]; spouts: Spout[];
  strickleX: number; carried: number; reducedMotion: boolean; random: () => number;
}
export const GEOMETRY: { bowlLeft, bowlRight, rim, bottom, spoutY, spoutMinX, spoutMaxX, spoutMinGap, strickleWidth, strickleRestRight, columns, overfill, maxGrains };
export const TIMING: { spoutStagger, settlingMax, sweeping, verdict, draining, sweptLife };
export function createSim(seed: number, opts?: { reducedMotion?: boolean }): SimState;
export function step(state: SimState, dtMs: number): void;
export function columnX(i: number): number;   // center x (0–1) of column i
export function surfaceY(state: SimState, x: number): number; // y (0–1) of the fill surface at x
```

In this task `step` implements `pouring` and `settling` only; Task 4 adds the other three phases and `spoutAt`. Write the file so Task 4 only fills in the marked `switch` cases.

- [ ] **Step 1: Write the failing tests `src/components/hero/instrument/sim.test.ts`**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, cannot find module `./sim`.

- [ ] **Step 3: Create `src/components/hero/instrument/sim.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all `rng` and `sim` tests pass. If «ends within 8 s» fails because pouring is too slow, lower `EMIT_INTERVAL` to `12`; if it fails on `avg ≥ overfill − 0.05`, nothing else should change (the check happens on the same tick the threshold is crossed). If «never exceeds the grain budget» fails, `emit` is missing its early return.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no output. If ESLint flags the unused `nextSeed` re-export, that is fine because it is exported.

- [ ] **Step 6: Commit**

From `STRICKLE/`:

```bash
git add landing/src/components/hero/instrument/sim.ts landing/src/components/hero/instrument/sim.test.ts
git commit -m "feat(landing): instrument simulation — geometry, pouring, settling

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuEGNWtYTWArFDJnXTSYij"
```

---

### Task 4: Simulation, part 2 — sweeping, verdict, draining, hover lookup

**Files:**
- Modify: `src/components/hero/instrument/sim.ts` (fill the three `switch` cases, add `spoutAt`, add easing helpers)
- Test: `src/components/hero/instrument/sim.test.ts` (append)

**Interfaces:**
- Produces: `spoutAt(state: SimState, x: number, y: number, toleranceX: number): number | null`. Everything else is behaviour on the existing `step`.

- [ ] **Step 1: Append failing tests to `sim.test.ts`**

```ts
import { spoutAt } from "./sim";

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
```

Put the `import { spoutAt } from "./sim";` line next to the existing import at the top of the file rather than mid-file.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test`
Expected: the `sweeping`, `draining`, and `spoutAt` tests fail; `reduced motion` may already pass.

- [ ] **Step 3: Implement the remaining phases in `sim.ts`**

Add these helpers above `substep`:

```ts
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
      spawnSwept(state, cx, excess * 0.5);
    } else if (h < 1 && state.carried > 0) {
      const fill = Math.min(state.carried, 1 - h);
      state.columns[i] = h + fill;
      state.carried -= fill;
    }
  }
}
```

Replace the three placeholder cases in `substep`:

```ts
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
```

Add `spoutAt` at the end of the file:

```ts
/** Index of the spout under (x, y), or null. The hit band is y in [0.14, rim]. Spec §5.3. */
export function spoutAt(state: SimState, x: number, y: number, toleranceX: number): number | null {
  if (y < 0.14 || y > GEOMETRY.rim) return null;
  for (let i = 0; i < state.spouts.length; i++) {
    if (Math.abs(state.spouts[i].x - x) <= toleranceX) return i;
  }
  return null;
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all pass. If the deterministic test from Task 3 breaks, `pickSpouts` or `emit` consumed `random()` in a different order between the two runs; make sure nothing calls `random` conditionally on wall-clock time.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no output.

- [ ] **Step 6: Commit**

From `STRICKLE/`:

```bash
git add landing/src/components/hero/instrument/sim.ts landing/src/components/hero/instrument/sim.test.ts
git commit -m "feat(landing): instrument simulation — sweeping, verdict, draining, spout lookup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuEGNWtYTWArFDJnXTSYij"
```

---

### Task 5: Canvas renderer

**Files:**
- Create: `src/components/hero/instrument/draw.ts`

**Interfaces:**
- Consumes: `SimState`, `GEOMETRY`, `TIMING`, `columnX` from `./sim`.
- Produces: `drawInstrument(ctx: CanvasRenderingContext2D, state: SimState, width: number, height: number, colors: { ink: string; accent: string }): void` — `width`/`height` in CSS pixels; the caller has already applied the DPR transform.

No unit test: this module only issues drawing calls. It is verified visually in Task 6.

- [ ] **Step 1: Create `src/components/hero/instrument/draw.ts`**

```ts
import { GEOMETRY, TIMING, columnX, type SimState } from "./sim";

export interface InstrumentColors {
  ink: string;
  accent: string;
}

const BOWL_STROKE = 3.5;
const SURFACE_STROKE = 1.5;
const GRAIN_RADIUS = 2.2;
const STRICKLE_HEIGHT = 6;
const SPOUT_HEIGHT = 14;
const BOWL_RADIUS = 2;

export function drawInstrument(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  width: number,
  height: number,
  colors: InstrumentColors,
): void {
  const X = (v: number) => v * width;
  const Y = (v: number) => v * height;
  const depth = Y(GEOMETRY.bottom) - Y(GEOMETRY.rim);

  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 1. Fill area under the heightfield, 22 % ink (the tint of the brand mark).
  ctx.beginPath();
  ctx.moveTo(X(GEOMETRY.bowlLeft), Y(GEOMETRY.bottom));
  for (let i = 0; i < GEOMETRY.columns; i++) {
    ctx.lineTo(X(columnX(i)), Y(GEOMETRY.bottom) - state.columns[i] * depth);
  }
  ctx.lineTo(X(GEOMETRY.bowlRight), Y(GEOMETRY.bottom));
  ctx.closePath();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = colors.ink;
  ctx.fill();
  ctx.globalAlpha = 1;

  // 2. Surface line.
  ctx.beginPath();
  for (let i = 0; i < GEOMETRY.columns; i++) {
    const x = X(columnX(i));
    const y = Y(GEOMETRY.bottom) - state.columns[i] * depth;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = SURFACE_STROKE;
  ctx.stroke();

  // 3. Bowl: three sides, open at the top, small corner radius at the bottom.
  const l = X(GEOMETRY.bowlLeft);
  const r = X(GEOMETRY.bowlRight);
  const top = Y(GEOMETRY.rim);
  const bot = Y(GEOMETRY.bottom);
  ctx.beginPath();
  ctx.moveTo(l, top);
  ctx.lineTo(l, bot - BOWL_RADIUS);
  ctx.quadraticCurveTo(l, bot, l + BOWL_RADIUS, bot);
  ctx.lineTo(r - BOWL_RADIUS, bot);
  ctx.quadraticCurveTo(r, bot, r, bot - BOWL_RADIUS);
  ctx.lineTo(r, top);
  ctx.lineWidth = BOWL_STROKE;
  ctx.strokeStyle = colors.ink;
  ctx.stroke();

  // 4. Spouts: short vertical ticks above the rim.
  for (const spout of state.spouts) {
    const x = X(spout.x);
    const y = Y(GEOMETRY.spoutY);
    ctx.beginPath();
    ctx.moveTo(x, y - SPOUT_HEIGHT);
    ctx.lineTo(x, y);
    ctx.lineWidth = spout.open ? BOWL_STROKE : 2;
    ctx.strokeStyle = colors.ink;
    ctx.stroke();
  }

  // 5. Grains.
  ctx.fillStyle = colors.ink;
  for (const g of state.grains) {
    ctx.globalAlpha = g.swept ? Math.max(0, g.life / TIMING.sweptLife) : 1;
    ctx.beginPath();
    ctx.arc(X(g.x), Y(g.y), GRAIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 6. Strickle: the single brass element, resting on the rim, longer than the bowl.
  if (state.phase === "sweeping" || state.phase === "verdict" || state.phase === "draining") {
    const right = X(state.strickleX);
    const left = right - X(GEOMETRY.strickleWidth);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(left, top - STRICKLE_HEIGHT / 2, right - left, STRICKLE_HEIGHT);
  }
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from either.

- [ ] **Step 3: Commit**

From `STRICKLE/`:

```bash
git add landing/src/components/hero/instrument/draw.ts
git commit -m "feat(landing): canvas renderer for the instrument

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuEGNWtYTWArFDJnXTSYij"
```

---

### Task 6: Verdict block and the Instrument client component

**Files:**
- Create: `src/components/hero/Verdict.tsx`
- Create: `src/components/hero/Instrument.tsx`
- Modify: `src/app/page.tsx` (temporary mount for visual check)

**Interfaces:**
- Consumes: `createSim`, `step`, `spoutAt`, `GEOMETRY`, `type Phase`, `type SimState` from `./instrument/sim`; `drawInstrument` from `./instrument/draw`.
- Produces: `<Verdict phase={Phase} elapsedMs={number} />` and `<Instrument />` (no props). `Instrument` renders its own `<Verdict />` below the canvas.

- [ ] **Step 1: Create `src/components/hero/Verdict.tsx`**

```tsx
import type { Phase } from "./instrument/sim";

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function isCompliant(phase: Phase): boolean {
  return phase === "verdict" || phase === "draining";
}

export function Verdict({ phase, elapsedMs }: { phase: Phase; elapsedMs: number }) {
  const compliant = isCompliant(phase);
  return (
    <div aria-live="polite" className="relative min-h-[76px]">
      {/* Proving */}
      <div
        className={`absolute inset-0 flex items-center gap-2 font-mono text-[13px] text-ink-muted transition-opacity duration-[400ms] ${
          compliant ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden={compliant}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="tabular-nums">Proving · {formatClock(elapsedMs)}</span>
      </div>

      {/* Compliant */}
      <div
        className={`absolute inset-0 flex items-start gap-3 rounded-[4px] border border-ok bg-ok-bg px-4 py-3 transition-opacity duration-[400ms] ${
          compliant ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!compliant}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-ok">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 10.5l2.5 2.5L14 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="font-display text-[20px] font-bold leading-tight text-ok">Compliant</div>
          <div className="font-body text-[13.5px] leading-normal text-ink">
            Meets the 16 % minimum · Regulation (EU) 2023/1542
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/hero/Instrument.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { drawInstrument } from "./instrument/draw";
import { GEOMETRY, createSim, spoutAt, step, type Phase, type SimState } from "./instrument/sim";
import { Verdict } from "./Verdict";

const MAX_DPR = 1.5;
const HOVER_TOLERANCE_PX = 24;
const UI_TICK_MS = 200;

interface UiSnapshot {
  phase: Phase;
  elapsedMs: number;
  spouts: number[]; // x positions, 0–1
}

function readColors(el: HTMLElement): { ink: string; accent: string } {
  const cs = getComputedStyle(el);
  return {
    ink: cs.getPropertyValue("--ink").trim() || "#171A1F",
    accent: cs.getPropertyValue("--accent").trim() || "#AB842B",
  };
}

function snapshot(sim: SimState): UiSnapshot {
  return { phase: sim.phase, elapsedMs: sim.cycleElapsed, spouts: sim.spouts.map((s) => s.x) };
}

export function Instrument() {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<SimState | null>(null);
  const [mounted, setMounted] = useState(false);
  const [ui, setUi] = useState<UiSnapshot>({ phase: "verdict", elapsedMs: 0, spouts: [] });
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sim = createSim((Date.now() >>> 0) || 1, { reducedMotion: reduced });
    simRef.current = sim;
    setMounted(true);
    setUi(snapshot(sim));

    let width = 0;
    let height = 0;
    let dpr = 1;
    const colors = readColors(box);

    const render = () => drawInstrument(ctx, sim, width, height, colors);

    const resize = () => {
      const rect = box.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    if (reduced) {
      return () => ro.disconnect();
    }

    let visible = true;
    let pageVisible = !document.hidden;
    let raf = 0;
    let last = 0;
    let lastUi = 0;
    let lastPhase: Phase = sim.phase;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last === 0 ? 16 : now - last;
      last = now;
      step(sim, dt);
      render();
      if (sim.phase !== lastPhase || now - lastUi >= UI_TICK_MS) {
        lastPhase = sim.phase;
        lastUi = now;
        setUi(snapshot(sim));
      }
    };
    const start = () => {
      if (raf === 0 && visible && pageVisible) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(box);

    const onVisibility = () => {
      pageVisible = !document.hidden;
      if (pageVisible) start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const sim = simRef.current;
    const box = boxRef.current;
    if (!sim || !box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setHovered(spoutAt(sim, x, y, HOVER_TOLERANCE_PX / rect.width));
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <div
        ref={boxRef}
        className="relative aspect-[4/3] w-full max-w-[560px] md:aspect-square"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block" />

        {/* Server / pre-hydration fallback: the static mark. */}
        {!mounted && (
          <div className="absolute inset-0 flex items-center justify-center text-ink" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="160" height="160" fill="none">
              <path d="M4 14H44" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
              <rect x="10.5" y="14" width="27" height="25.5" rx="2" stroke="currentColor" strokeWidth="3.5" />
              <rect x="15" y="19" width="18" height="16" fill="currentColor" opacity=".22" />
            </svg>
          </div>
        )}

        {/* Rim tick and threshold label. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute flex -translate-y-1/2 items-center gap-2 font-mono text-[11px] text-ink-muted"
          style={{ right: `${(1 - GEOMETRY.bowlLeft) * 100}%`, top: `${GEOMETRY.rim * 100}%` }}
        >
          <span className="whitespace-nowrap">16 % · threshold</span>
          <span className="block h-px w-2 bg-ink-muted" />
        </div>

        {/* Supplier labels on hover. */}
        {ui.spouts.map((x, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={`pointer-events-none absolute whitespace-nowrap rounded-[4px] border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-ink transition-opacity duration-150 ${
              hovered === i ? "opacity-100" : "opacity-0"
            }`}
            style={{ left: `calc(${x * 100}% + 12px)`, top: `${GEOMETRY.spoutY * 100}%`, transform: "translateY(-100%)" }}
          >
            Supplier {String(i + 1).padStart(2, "0")} · signed · not disclosed
          </div>
        ))}
      </div>

      <Verdict phase={mounted ? ui.phase : "verdict"} elapsedMs={ui.elapsedMs} />
    </div>
  );
}
```

- [ ] **Step 3: Mount it temporarily in `src/app/page.tsx`**

```tsx
import { Instrument } from "@/components/hero/Instrument";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-[560px]">
        <Instrument />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Type-check, lint, run**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output.

Run `npm run dev` in the background and open `http://localhost:3000`. Check, in order:

1. Spouts appear one by one; grains fall and heap under each spout.
2. The brass bar slides in from the left along the rim, sweeps the excess right, and stops longer than the bowl on both sides.
3. The block below switches from «Proving · 00:0N» to the green Compliant box.
4. After a pause the bowl empties, the bar leaves right, and a new cycle starts with different spout positions.
5. Hovering a spout tick shows «Supplier 0N · signed · not disclosed».
6. In DevTools → Rendering → «Emulate CSS prefers-reduced-motion: reduce», reload: static levelled bowl, bar in place, Compliant visible, nothing moves.
7. Switch to another tab and back: the animation resumes without a jump.

Stop the dev server.

- [ ] **Step 5: Commit**

From `STRICKLE/`:

```bash
git add landing/src/components/hero/Verdict.tsx landing/src/components/hero/Instrument.tsx landing/src/app/page.tsx
git commit -m "feat(landing): Instrument client component and Verdict block

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuEGNWtYTWArFDJnXTSYij"
```

---

### Task 7: Wordmark and site header

**Files:**
- Create: `src/components/site/Wordmark.tsx`
- Create: `src/components/site/SiteHeader.tsx`

**Interfaces:**
- Produces: `<Wordmark />` (lockup, Steel via `currentColor`), `<SiteHeader />` (68 px bar).

- [ ] **Step 1: Create `src/components/site/Wordmark.tsx`**

```tsx
export function Wordmark() {
  return (
    <a href="#" className="inline-flex items-center gap-3 text-ink" aria-label="STRICKLE, home">
      <svg viewBox="0 0 48 48" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M4 14H44" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="10.5" y="14" width="27" height="25.5" rx="2" stroke="currentColor" strokeWidth="3.5" />
        <rect x="15" y="19" width="18" height="16" fill="currentColor" opacity=".22" />
      </svg>
      <span className="font-display text-[17px] font-extrabold uppercase tracking-[0.06em]">STRICKLE</span>
    </a>
  );
}
```

- [ ] **Step 2: Create `src/components/site/SiteHeader.tsx`**

```tsx
import { Wordmark } from "./Wordmark";

const NAV = [
  { label: "Product", href: "#" },
  { label: "Proof", href: "#" },
  { label: "Docs", href: "#" },
];

export function SiteHeader() {
  return (
    <header className="flex h-[68px] items-center justify-between px-[clamp(24px,4vw,64px)]">
      <Wordmark />
      <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
        {NAV.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="font-body text-[15px] font-medium text-ink hover:text-accent-text"
          >
            {item.label}
          </a>
        ))}
      </nav>
      <a
        href="#"
        className="inline-flex h-11 items-center rounded-[4px] bg-ink px-5 font-body text-[15px] font-medium text-ground"
      >
        Open the console
      </a>
    </header>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output.

- [ ] **Step 4: Commit**

From `STRICKLE/`:

```bash
git add landing/src/components/site
git commit -m "feat(landing): wordmark and site header

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuEGNWtYTWArFDJnXTSYij"
```

---

### Task 8: Hero section, page assembly, responsive and acceptance checks

**Files:**
- Create: `src/components/hero/Hero.tsx`
- Modify: `src/app/page.tsx` (final)
- Modify: `src/components/hero/Instrument.tsx` (only if the visual check demands a size fix)

**Interfaces:**
- Consumes: `<Instrument />`, `<SiteHeader />`.
- Produces: `<Hero />`.

- [ ] **Step 1: Create `src/components/hero/Hero.tsx`**

```tsx
import { Instrument } from "./Instrument";

const RAIL = [
  "Regulation (EU) 2023/1542",
  "Passport mandatory 18 Feb 2027",
  "16 % Co · 85 % Pb · 6 % Li · 6 % Ni",
];

export function Hero() {
  return (
    <section className="flex min-h-[calc(100svh-68px)] flex-col">
      <div className="grid flex-1 items-center gap-12 px-[clamp(24px,4vw,64px)] py-12 max-md:px-[22px] md:grid-cols-[46fr_54fr] md:py-8">
        <div className="max-w-[620px]">
          <p className="reveal font-body text-[12px] font-medium uppercase tracking-[0.10em] text-ink-muted">
            Confidential product passport · Batteries
          </p>
          <h1 className="reveal reveal-delay-1 mt-5 font-display text-[clamp(38px,10vw,56px)] font-extrabold leading-none tracking-[-0.01em] text-ink [text-wrap:balance] md:text-[clamp(44px,5.4vw,84px)]">
            Prove the threshold.
            <br />
            <em className="font-bold">Keep the recipe.</em>
          </h1>
          <p className="reveal reveal-delay-2 mt-6 max-w-[460px] font-body text-[17px] leading-normal text-ink">
            Signed supplier attestations, aggregated inside a zero-knowledge circuit, become one verdict on chain:
            the recycled-content minimum is met. Suppliers, quantities and prices never leave your device.
          </p>
          <div className="reveal reveal-delay-3 mt-8 flex flex-wrap items-center gap-6">
            <a
              href="#"
              className="inline-flex h-11 items-center rounded-[4px] bg-ink px-5 font-body text-[15px] font-medium text-ground"
            >
              Open the console
            </a>
            <a href="#" className="font-body text-[15px] font-medium text-accent-text hover:underline">
              Read how it works →
            </a>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <div className="w-full md:w-[min(560px,42vw)]">
            <Instrument />
          </div>
        </div>
      </div>

      <footer className="flex h-14 items-center justify-between gap-6 border-t border-edge px-[clamp(24px,4vw,64px)] font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted tabular-nums max-md:px-[22px]">
        <ul className="flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap">
          {RAIL.map((item, i) => (
            <li key={item} className={`flex items-center gap-3 ${i > 0 ? "max-md:hidden" : ""}`}>
              {i > 0 && <span aria-hidden="true">·</span>}
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <span className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ink" />
          Built on Midnight
        </span>
      </footer>
    </section>
  );
}
```

- [ ] **Step 2: Final `src/app/page.tsx`**

```tsx
import { Hero } from "@/components/hero/Hero";
import { SiteHeader } from "@/components/site/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Hero />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Type-check, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: no lint output, all tests pass, build lists route `/` as static.

- [ ] **Step 4: Visual acceptance**

Run `npm run dev` in the background, open `http://localhost:3000`, and check at 1440, 1024, 768, and 390 px wide (DevTools device toolbar):

| Check | Expected |
|---|---|
| Header | 68 px, lockup in Steel, nav visible ≥ 768 px only (Tailwind `md`), button Steel with Zinc text |
| Text column | Label uppercase and tracked; H1 two lines, second in italic; lead wraps at ≤ 460 px |
| Entrance | Label, H1, lead, actions fade and rise in sequence over ~1 s |
| Instrument | Square on desktop, 4:3 below `md`; centered under text on mobile |
| Brass | Appears only as the strickle bar |
| Rail | All three items plus «Built on Midnight» on desktop; only the regulation and «Built on Midnight» on mobile |
| Reduced motion | No entrance animation, instrument static and levelled, Compliant visible |
| Scroll | No horizontal scrollbar at 390 px or 360 px |
| Keyboard | Tab reaches lockup, nav, both buttons and the secondary link, each with a 2 px Bronze ring |

Stop the dev server. If any check fails, fix the class in `Hero.tsx`, `SiteHeader.tsx` or `Instrument.tsx` and re-run Step 3.

- [ ] **Step 5: Commit**

From `STRICKLE/`:

```bash
git add landing/src
git commit -m "feat(landing): hero section and page assembly

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuEGNWtYTWArFDJnXTSYij"
```

---

## Plan self-review

**Spec coverage.** §3 composition → Tasks 7, 8. §4 copy → Tasks 6, 7, 8 (every string appears verbatim). §5.1 geometry → Task 3 `GEOMETRY`, Task 5 strokes. §5.2 cycle → Tasks 3, 4. §5.3 hover → Tasks 4 (`spoutAt`), 6 (labels). §5.4 reduced motion, pause, fallback → Tasks 3, 6. §5.5 verdict block → Task 6. §6.1 tokens and theme → Task 1. §6.2 fonts and sizes → Tasks 1, 8. §6.3 reveal → Tasks 1, 8. §6.4 focus and contrast → Task 1 (`:focus-visible`), Task 8 checks. §7 file map → matches. §8 accessibility and perf → Task 6 (`aria-hidden`, `aria-live`, DPR cap, grain budget in Task 3). §9 tests → Tasks 2, 3, 4 cover all seven listed cases (determinism, pouring ends, levelled after sweep, overfill before sweep, reduced motion, `spoutAt`, new cycle with new seed). §10 out of scope → nothing planned beyond it.

**Type consistency.** `SimState` fields used in Tasks 5 and 6 (`phase`, `columns`, `grains`, `spouts`, `strickleX`, `cycleElapsed`) match Task 3. `spoutAt(state, x, y, toleranceX)` matches between Task 4 and Task 6. `drawInstrument(ctx, state, width, height, colors)` matches between Task 5 and Task 6. `Verdict` props `{ phase, elapsedMs }` match between Task 6 definitions and use.

**Step cap.** `step` clamps each call to 50 ms and sub-steps at 60 Hz, so tests that need to advance time must loop with small `dt` values (the `advanceUntil` helper does this). No single `step` call should be expected to advance more than 50 ms.

**Known judgement call.** The header nav breakpoint is Tailwind's `md` (768 px), not the spec's 900 px, to avoid a custom breakpoint for one rule; the instrument's aspect switch uses the same `md`. If David wants 900 px exactly, add `--breakpoint-md: 900px` to the `@theme inline` block in Task 1 and nothing else changes.
