import { describe, expect, it } from "vitest";
import { VIEWPORTS } from "../src/viewports.ts";

describe("VIEWPORTS", () => {
  it("covers every width the project requires", () => {
    const widths = VIEWPORTS.map((v) => v.width);
    for (const width of [320, 390, 768, 1024, 1280, 1440, 1920, 2560]) expect(widths).toContain(width);
  });

  it("includes a short laptop and a landscape phone", () => {
    expect(VIEWPORTS).toContainEqual(expect.objectContaining({ width: 1280, height: 720 }));
    expect(VIEWPORTS).toContainEqual(expect.objectContaining({ name: "phone-landscape", width: 844, height: 390 }));
  });

  it("uses unique names", () => {
    expect(new Set(VIEWPORTS.map((v) => v.name)).size).toBe(VIEWPORTS.length);
  });
});
