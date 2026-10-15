const isUint32 = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;

/** Mulberry32: a 32-bit seeded generator returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  if (!isUint32(seed)) throw new RangeError(`seed must be a uint32, got ${seed}`);
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

export function randomBelow(next: () => number, bound: number): number {
  if (!Number.isInteger(bound) || bound <= 0) throw new RangeError(`bound must be a positive integer, got ${bound}`);
  return Math.floor(next() * bound);
}
