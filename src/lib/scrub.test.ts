import { describe, expect, it } from "vitest";
import { pointerFraction, snapToOnset } from "./scrub";

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

describe("snapToOnset", () => {
  const onsets = [0.5, 2.0, 2.2];

  it("snaps to the nearest onset within the window", () => {
    expect(snapToOnset(0.55, onsets, 0.1)).toBe(0.5);
    expect(snapToOnset(2.09, onsets, 0.1)).toBe(2.0);
    expect(snapToOnset(2.12, onsets, 0.1)).toBe(2.2);
  });

  it("leaves clicks outside the window alone", () => {
    expect(snapToOnset(1.2, onsets, 0.1)).toBe(1.2);
    // Exactly at the window edge stays free (strictly-within semantics).
    // Binary-exact values: 0.75 - 0.5 is exactly 0.25 in IEEE 754,
    // whereas 0.6 - 0.5 is 0.0999…98 and would falsely sit "inside".
    expect(snapToOnset(0.75, [0.5], 0.25)).toBe(0.75);
  });

  it("passes through when onsets are missing or empty", () => {
    expect(snapToOnset(1.0, null, 0.1)).toBe(1.0);
    expect(snapToOnset(1.0, undefined, 0.1)).toBe(1.0);
    expect(snapToOnset(1.0, [], 0.1)).toBe(1.0);
  });
});
