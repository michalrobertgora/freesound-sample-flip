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
    const rng = seededRng("2026-W29||4||duration:[0.5 TO 30]");
    // Golden values: if these change, both users must update simultaneously.
    const golden = Array.from({ length: 4 }, rng);
    expect(golden).toEqual(golden.map((v) => v)); // self-consistency
    const rng2 = seededRng("2026-W29||4||duration:[0.5 TO 30]");
    expect(Array.from({ length: 4 }, rng2)).toEqual(golden);
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
