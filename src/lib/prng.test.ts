import { describe, expect, it } from "vitest";
import { drawDistinctIndices, quantizeCount, seededRng } from "./prng";

describe("seededRng", () => {
  it("is deterministic: same seed → same sequence", () => {
    const a = seededRng("2026-W29||4||duration:[0.5 TO 30]");
    const b = seededRng("2026-W29||4||duration:[0.5 TO 30]");
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("different seeds → different sequences", () => {
    const a = seededRng("2026-W29|x");
    const b = seededRng("2026-W30|x");
    const seqA = Array.from({ length: 10 }, a);
    const seqB = Array.from({ length: 10 }, b);
    expect(seqA).not.toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = seededRng("range-check");
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("pins exact values so any algorithm change is caught (cross-machine contract)", () => {
    // Hard-coded golden values: if these ever change, xmur3/mulberry32
    // changed and every user must update simultaneously or sets diverge.
    const rng = seededRng("2026-W29||4||duration:[0.5 TO 30]");
    expect(Array.from({ length: 5 }, rng)).toEqual([
      0.2669292588252574, 0.9977047969587147, 0.8255365998484194,
      0.579323148354888, 0.8155084026511759,
    ]);
  });
});

describe("drawDistinctIndices golden values (cross-machine contract)", () => {
  // Pins the whole seed→indices pipeline, rejection sampling included.
  it("draws known indices for known seeds", () => {
    expect(
      drawDistinctIndices(seededRng("2026-W29||4||duration:[0.5 TO 30]"), 4, 8400),
    ).toEqual([2242, 8380, 6934, 4866]);
    expect(
      drawDistinctIndices(
        seededRng("2026-W29|reroll|5|ambient pad|duration:[0.5 TO 30] type:(aiff OR wav)"),
        5,
        1200,
      ),
    ).toEqual([1177, 566, 727, 341, 408]);
  });
});

describe("drawDistinctIndices", () => {
  it("draws n distinct indices within range", () => {
    const idx = drawDistinctIndices(seededRng("t"), 6, 10_000);
    expect(idx).toHaveLength(6);
    expect(new Set(idx).size).toBe(6);
    for (const i of idx) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(10_000);
      expect(Number.isInteger(i)).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(drawDistinctIndices(seededRng("s"), 5, 5000)).toEqual(
      drawDistinctIndices(seededRng("s"), 5, 5000),
    );
  });

  it("returns all indices when range <= n", () => {
    expect(drawDistinctIndices(seededRng("s"), 6, 4)).toEqual([0, 1, 2, 3]);
  });

  it("returns empty for empty range", () => {
    expect(drawDistinctIndices(seededRng("s"), 4, 0)).toEqual([]);
  });
});

describe("quantizeCount", () => {
  it("floors to two significant figures", () => {
    expect(quantizeCount(8431)).toBe(8400);
    expect(quantizeCount(8499)).toBe(8400);
    expect(quantizeCount(256)).toBe(250);
    expect(quantizeCount(100)).toBe(100);
    expect(quantizeCount(1_234_567)).toBe(1_200_000);
  });

  it("keeps small counts as-is", () => {
    expect(quantizeCount(87)).toBe(87);
    expect(quantizeCount(1)).toBe(1);
    expect(quantizeCount(0)).toBe(0);
  });

  it("absorbs small drift: nearby counts map to the same range", () => {
    expect(quantizeCount(8412)).toBe(quantizeCount(8431));
  });
});
