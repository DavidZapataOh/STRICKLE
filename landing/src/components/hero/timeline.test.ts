import { describe, expect, it } from "vitest";
import { activePiece, coverBox, LOOP_SECONDS, PIECES, toScreen } from "./timeline";

describe("activePiece", () => {
  it("is null while the car is whole", () => {
    expect(activePiece(0)).toBeNull();
    expect(activePiece(1.5)).toBeNull();
    expect(activePiece(7.5)).toBeNull();
    expect(activePiece(14.8)).toBeNull();
  });

  it("shows the battery passport while the pack is out and still", () => {
    expect(activePiece(3.0)?.id).toBe("battery");
    expect(activePiece(4.5)?.id).toBe("battery");
    expect(activePiece(5.7)?.id).toBe("battery");
  });

  it("shows the bumper passport while the front end floats", () => {
    expect(activePiece(10.3)?.id).toBe("bumper");
    expect(activePiece(12)?.id).toBe("bumper");
    expect(activePiece(13.5)?.id).toBe("bumper");
  });

  it("closes each window before the piece starts moving back", () => {
    expect(activePiece(5.95)).toBeNull();
    expect(activePiece(13.75)).toBeNull();
  });

  it("wraps times beyond the loop length", () => {
    expect(activePiece(LOOP_SECONDS + 4)?.id).toBe("battery");
  });

  it("never overlaps two windows", () => {
    const [a, b] = PIECES;
    expect(a.window[1]).toBeLessThan(b.window[0]);
  });
});

describe("coverBox", () => {
  const aspect = 1928 / 1072;

  it("fills the height and overflows the width on a tall container", () => {
    const box = coverBox(800, 800, aspect, 0.7);
    expect(box.height).toBe(800);
    expect(box.width).toBeCloseTo(800 * aspect, 5);
    expect(box.top).toBe(0);
    // focus 0.7 keeps 70 % of the overflow hidden on the left
    expect(box.left).toBeCloseTo(-(box.width - 800) * 0.7, 5);
  });

  it("fills the width and overflows the height on a wide container", () => {
    const box = coverBox(2000, 600, aspect, 0.7);
    expect(box.width).toBe(2000);
    expect(box.height).toBeCloseTo(2000 / aspect, 5);
    expect(box.left).toBe(0);
    expect(box.top).toBeCloseTo(-(box.height - 600) / 2, 5);
  });

  it("matches exactly when the ratios agree", () => {
    const box = coverBox(1928, 1072, aspect, 0.5);
    expect(box).toEqual({ left: 0, top: 0, width: 1928, height: 1072 });
  });
});

describe("toScreen", () => {
  it("maps frame percentages into the cover box", () => {
    const box = { left: -100, top: 0, width: 2000, height: 1000 };
    expect(toScreen({ x: 50, y: 50 }, box)).toEqual({ x: 900, y: 500 });
    expect(toScreen({ x: 0, y: 100 }, box)).toEqual({ x: -100, y: 1000 });
  });
});
