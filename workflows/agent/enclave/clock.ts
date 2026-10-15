// workflows/agent/enclave/clock.ts
import { type PlainDate, fromEpochDay } from "@strickle/core";

const DAY_MS = 86_400_000;

export const todayOf = (now: Date, offsetDays: number): PlainDate => fromEpochDay(Math.floor(now.getTime() / DAY_MS) + offsetDays);

/** Where a run's scan of the registry starts: it moves by `stride` each period, so consecutive runs tile the registry. */
export const windowSeed = (nowMs: number, periodMs: number, stride: number): number => Math.floor(nowMs / periodMs) * stride;
