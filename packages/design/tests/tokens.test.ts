// packages/design/tests/tokens.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8");

const PALETTE: Record<string, string> = {
  night: "#22141a",
  blush: "#fbf3ef",
  hibiscus: "#a3214f",
  "hibiscus-deep": "#861a41",
  "hibiscus-light": "#e2779b",
  marigold: "#e9a23b",
  calyx: "#2e6a4f",
  "calyx-tint": "#e7eee8",
  clay: "#6e4a3e",
  ember: "#9a3412",
  amber: "#b45309",
  husk: "#f3e5dd",
  line: "#eadbd2",
  card: "#fdf8f5",
};

describe("tokens.css", () => {
  it.each(Object.entries(PALETTE))("declares --%s as %s", (name, hex) => {
    expect(css).toContain(`--${name}: ${hex};`);
  });

  it("scales type in rem steps and never from the viewport width", () => {
    expect(css).not.toMatch(/--fs-[a-z0-9-]+:[^;]*(vw|vh|clamp)/);
    for (const step of ["xs", "sm", "base", "lg", "xl", "2xl", "3xl"]) expect(css).toContain(`--fs-${step}:`);
  });

  it("never sets a font size below 12 px", () => {
    const sizes = [...css.matchAll(/--fs-[a-z0-9-]+:\s*([0-9.]+)rem/g)].map((match) => Number(match[1]) * 16);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it("zeroes the motion durations under reduced motion and sets no global rule", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).not.toMatch(/\*\s*,\s*\*::before/);
    expect(css).not.toContain("!important");
  });

  it("draws the focus indicator as an outline that survives forced colors", () => {
    expect(css).toMatch(/--focus-width:\s*3px;/);
    expect(css).toMatch(/--focus-offset:\s*2px;/);
  });
});
