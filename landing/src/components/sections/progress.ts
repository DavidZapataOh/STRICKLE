/** Manufacturer console demo clock: proving takes PROVE_MS, then the verdict holds HOLD_MS. */
export const PROVE_MS = 14_000;
export const HOLD_MS = 6_000;
export const CYCLE_MS = PROVE_MS + HOLD_MS;

/** Percent complete at `ms` into a cycle, 0..100. */
export function progressAt(ms: number): number {
  const t = ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  return Math.min(100, Math.round((t / PROVE_MS) * 1000) / 10);
}

export function isDone(ms: number): boolean {
  return progressAt(ms) >= 100;
}

/** "00:07" style clock for the proving label. */
export function clockAt(ms: number): string {
  const t = ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const s = Math.min(Math.floor(t / 1000), Math.floor(PROVE_MS / 1000));
  return `00:${String(s).padStart(2, "0")}`;
}
