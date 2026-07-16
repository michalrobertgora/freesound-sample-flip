import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  canonicalFilterString,
  formatNum,
  normalizeText,
  seedString,
  type FilterParams,
} from "./filters";

const base: FilterParams = { ...DEFAULT_FILTERS, tags: [], types: [] };

describe("formatNum", () => {
  it("quantizes to 0.1 and strips float noise", () => {
    expect(formatNum(1.5)).toBe("1.5");
    expect(formatNum(1.4999999)).toBe("1.5");
    expect(formatNum(3)).toBe("3");
    expect(formatNum(3.0)).toBe("3");
    expect(formatNum(0.1 + 0.2)).toBe("0.3");
  });
});

describe("normalizeText", () => {
  it("trims, collapses whitespace, lowercases", () => {
    expect(normalizeText("  Field   Recording ")).toBe("field recording");
    expect(normalizeText("")).toBe("");
  });
});

describe("canonicalFilterString", () => {
  it("builds the default duration-only filter", () => {
    expect(canonicalFilterString(base)).toBe("duration:[0.5 TO 30]");
  });

  it("uses * for unbounded sides and omits duration when both unbounded", () => {
    expect(canonicalFilterString({ ...base, durationMax: null })).toBe(
      "duration:[0.5 TO *]",
    );
    expect(
      canonicalFilterString({ ...base, durationMin: null, durationMax: null }),
    ).toBe("");
  });

  it("sorts and dedupes multi-values regardless of input order", () => {
    const a = canonicalFilterString({
      ...base,
      types: ["wav", "aiff"],
      tags: ["Drone", "field recording"],
    });
    const b = canonicalFilterString({
      ...base,
      types: ["aiff", "WAV", "wav"],
      tags: ["field   recording", "drone"],
    });
    expect(a).toBe(b);
    expect(a).toBe(
      'duration:[0.5 TO 30] tag:drone tag:"field recording" type:(aiff OR wav)',
    );
  });

  it("uses bare type: for a single type", () => {
    expect(canonicalFilterString({ ...base, types: ["wav"] })).toContain(
      "type:wav",
    );
  });

  it("quotes multi-word license values", () => {
    expect(
      canonicalFilterString({ ...base, license: "Creative Commons 0" }),
    ).toContain('license:"Creative Commons 0"');
  });
});

describe("seedString", () => {
  it("is stable for equivalent inputs", () => {
    const a = seedString("2026-W29", " Reroll ", 4, {
      ...base,
      query: "  Ambient  Pad ",
      types: ["wav", "aiff"],
    });
    const b = seedString("2026-W29", "reroll", 4, {
      ...base,
      query: "ambient pad",
      types: ["aiff", "wav"],
    });
    expect(a).toBe(b);
    expect(a).toBe(
      "2026-W29|reroll|4|ambient pad|duration:[0.5 TO 30] type:(aiff OR wav)",
    );
  });

  it("changes when any seed-relevant input changes", () => {
    const s = (week: string, salt: string, n: number, q: string) =>
      seedString(week, salt, n, { ...base, query: q });
    const ref = s("2026-W29", "", 4, "");
    expect(s("2026-W30", "", 4, "")).not.toBe(ref);
    expect(s("2026-W29", "x", 4, "")).not.toBe(ref);
    expect(s("2026-W29", "", 5, "")).not.toBe(ref);
    expect(s("2026-W29", "", 4, "rain")).not.toBe(ref);
  });

  it("treats empty salt and whitespace salt identically", () => {
    expect(seedString("2026-W29", "", 4, base)).toBe(
      seedString("2026-W29", "   ", 4, base),
    );
  });
});
