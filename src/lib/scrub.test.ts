import { describe, expect, it } from "vitest";
import { pointerFraction } from "./scrub";

describe("pointerFraction", () => {
  it("maps a pointer x inside the element to its time fraction", () => {
    expect(pointerFraction(150, 100, 200)).toBe(0.25);
    expect(pointerFraction(300, 100, 200)).toBe(1);
    expect(pointerFraction(100, 100, 200)).toBe(0);
  });

  it("clamps positions outside the element", () => {
    expect(pointerFraction(50, 100, 200)).toBe(0);
    expect(pointerFraction(400, 100, 200)).toBe(1);
  });

  it("returns 0 for degenerate zero-width rects", () => {
    expect(pointerFraction(100, 100, 0)).toBe(0);
  });
});
