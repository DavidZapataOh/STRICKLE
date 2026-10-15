export type ParameterStatus = "accepted" | "clamped" | "rejected";

export interface ParameterChange {
  name: string;
  requested: number;
  applied: number | null;
  status: ParameterStatus;
  reason: string;
}

const RANGES: Record<string, [number, number]> = {
  epsilonBps: [50, 500],
  floorDays: [7, 30],
  targetDays: [14, 90],
  marginBps: [100, 1_000],
  raiseStepBps: [100, 2_500],
};
const EMERGENCY_MONTHS = [3, 6, 12];

/** The validator of section 5: a value the model suggests is clamped to its range and logged, never applied as is. */
export function validateParameterProposal(name: string, requested: number, context: { floorDays: number; targetDays: number }): ParameterChange {
  const reject = (reason: string): ParameterChange => ({ name, requested, applied: null, status: "rejected", reason });
  if (!Number.isInteger(requested)) return reject("the value must be an integer");
  if (name === "emergencyMonths") {
    return EMERGENCY_MONTHS.includes(requested) ? { name, requested, applied: requested, status: "accepted", reason: "one of 3, 6 or 12 months" } : reject("the emergency fund is 3, 6 or 12 months");
  }
  const base = RANGES[name];
  if (!base) return reject(`unknown parameter ${name}`);
  let [min, max] = base;
  if (name === "targetDays") min = Math.max(min, context.floorDays);
  if (name === "floorDays") max = Math.min(max, context.targetDays);
  if (requested < min) return { name, requested, applied: min, status: "clamped", reason: `below the allowed range ${min} to ${max}` };
  if (requested > max) return { name, requested, applied: max, status: "clamped", reason: `above the allowed range ${min} to ${max}` };
  return { name, requested, applied: requested, status: "accepted", reason: `within the allowed range ${min} to ${max}` };
}
