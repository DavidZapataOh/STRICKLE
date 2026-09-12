import { describe, expect, it } from "vitest";
import { clockAt, CYCLE_MS, isDone, progressAt, PROVE_MS } from "./progress";

describe("console demo clock", () => {
  it("starts at zero and reaches 100 at the end of proving", () => {
    expect(progressAt(0)).toBe(0);
    expect(progressAt(PROVE_MS / 2)).toBe(50);
    expect(progressAt(PROVE_MS)).toBe(100);
  });

  it("holds at 100 during the verdict window, then restarts", () => {
    expect(progressAt(PROVE_MS + 1000)).toBe(100);
    expect(isDone(PROVE_MS + 5999)).toBe(true);
    expect(progressAt(CYCLE_MS)).toBe(0);
    expect(isDone(CYCLE_MS + 10)).toBe(false);
  });

  it("formats the proving clock in seconds and caps it", () => {
    expect(clockAt(0)).toBe("00:00");
    expect(clockAt(7400)).toBe("00:07");
    expect(clockAt(PROVE_MS + 3000)).toBe("00:14");
  });
});
