import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  canonicalFilterString,
  formatNum,
  normalizeText,
  seedString,
  type FilterParams,
} from "./filters";

const base: FilterParams = {
  ...DEFAULT_FILTERS,
  tags: [],
  types: [],
  categories: [],
};

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

describe("advanced filters (ticket 06)", () => {
  it("keeps non-advanced canonical strings byte-identical (backward-compatible seeds)", () => {
    // The exact strings older tests pinned — advanced defaults add nothing.
    expect(canonicalFilterString(base)).toBe("duration:[0.5 TO 30]");
    expect(
      canonicalFilterString({ ...base, types: ["wav", "aiff"], tags: ["drone"] }),
    ).toBe("duration:[0.5 TO 30] tag:drone type:(aiff OR wav)");
  });

  it("emits every advanced part in the fixed key order", () => {
    const s = canonicalFilterString({
      ...base,
      ratingMin: 4,
      boominessMin: 30,
      brightnessMin: 55,
      createdFrom: "2020-01-01",
      createdTo: null,
      geo: { lat: 41.3833, lon: 2.1833, radiusKm: 10 },
      hardnessMin: 20,
      loopable: true,
      singleEvent: true,
      tonality: "C minor",
      warmthMin: 60,
    });
    expect(s).toBe(
      "avg_rating:[4 TO *] boominess:[30 TO *] brightness:[55 TO *] " +
        "created:[2020-01-01T00:00:00Z TO *] duration:[0.5 TO 30] " +
        "{!geofilt sfield=geotag pt=41.3833,2.1833 d=10} " +
        'hardness:[20 TO *] loopable:true single_event:true tonality:"C minor" ' +
        "warmth:[60 TO *]",
    );
  });

  it("quantizes geo coordinates to 4 decimals, stably", () => {
    const a = canonicalFilterString({
      ...base,
      durationMin: null,
      durationMax: null,
      geo: { lat: 52.229731, lon: 21.012228, radiusKm: 25 },
    });
    expect(a).toBe("{!geofilt sfield=geotag pt=52.2297,21.0122 d=25}");
  });

  it("keeps tonality case exactly as chosen (Solr string match is case-sensitive)", () => {
    expect(
      canonicalFilterString({ ...base, durationMin: null, durationMax: null, tonality: "A# major" }),
    ).toBe('tonality:"A# major"');
  });
});

describe("default file types (ticket 08) + categories (ticket 10)", () => {
  it("pins the pristine-default string — deliberate seed breaks", () => {
    // Pre-ticket-08 pristine states produced "duration:[0.5 TO 30]".
    // Ticket 08 added type:(mp3 OR wav); ticket 10 added the 4-of-5
    // category default. Both breaks recorded in the ticket comments.
    expect(canonicalFilterString({ ...DEFAULT_FILTERS })).toBe(
      'category:("Instrument samples" OR "Music" OR "Sound effects" OR "Soundscapes") ' +
        "duration:[0.5 TO 30] type:(mp3 OR wav)",
    );
    expect(DEFAULT_FILTERS.types).toEqual(["wav", "mp3"]);
  });
});

describe("category filter (ticket 10)", () => {
  it("emits sorted, always-quoted values in the fixed key order", () => {
    const s = canonicalFilterString({
      ...base,
      brightnessMin: 55,
      categories: ["Sound effects", "Music"],
      createdFrom: "2020-01-01",
    });
    expect(s).toBe(
      'brightness:[55 TO *] category:("Music" OR "Sound effects") ' +
        "created:[2020-01-01T00:00:00Z TO *] duration:[0.5 TO 30]",
    );
  });

  it("quotes single values too", () => {
    expect(canonicalFilterString({ ...base, categories: ["Speech"] })).toBe(
      'category:"Speech" duration:[0.5 TO 30]',
    );
  });

  it("emits nothing for none-selected and all-five-selected alike", () => {
    // Live-verified 2026-07-17: all five ORed = 728,851 vs 729,103
    // unfiltered (252 uncategorized sounds) — "everything checked" means
    // "don't care", so it emits no clause and keeps those sounds in.
    expect(canonicalFilterString(base)).toBe("duration:[0.5 TO 30]");
    expect(
      canonicalFilterString({
        ...base,
        categories: [
          "Instrument samples",
          "Music",
          "Sound effects",
          "Soundscapes",
          "Speech",
        ],
      }),
    ).toBe("duration:[0.5 TO 30]");
  });

  it("dedupes while keeping exact case (values are canonical by construction)", () => {
    expect(
      canonicalFilterString({ ...base, categories: ["Music", "Music"] }),
    ).toBe('category:"Music" duration:[0.5 TO 30]');
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
