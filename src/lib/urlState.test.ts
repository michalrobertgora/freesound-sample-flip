import { describe, expect, it } from "vitest";
import { serializeState as ser } from "./urlState";

describe("advanced params round-trip (ticket 06)", () => {
  it("round-trips every advanced filter through the URL", () => {
    const qs =
      "?w=2026-W29&ton=C+minor&loop=1&single=1&bri=55&warm=60&hard=20&boom=30" +
      "&rating=4&cfrom=2020-01-01&cto=2024-06-30&geo=52.2297,21.0122,25";
    const s = parseState(qs);
    expect(s.filters.tonality).toBe("C minor");
    expect(s.filters.loopable).toBe(true);
    expect(s.filters.singleEvent).toBe(true);
    expect(s.filters.brightnessMin).toBe(55);
    expect(s.filters.geo).toEqual({ lat: 52.2297, lon: 21.0122, radiusKm: 25 });
    expect(parseState(`?${ser(s)}`)).toEqual(s);
  });

  it("drops malformed geo and dates instead of propagating garbage", () => {
    const s = parseState("?w=2026-W29&geo=999,0,10&cfrom=someday&cto=2024-13-99x");
    expect(s.filters.geo).toBeNull();
    expect(s.filters.createdFrom).toBeNull();
    expect(s.filters.createdTo).toBeNull();
  });

  it("omits advanced defaults from serialized URLs", () => {
    expect(ser(parseState("?w=2026-W29"))).toBe("w=2026-W29");
  });
});

describe("ids cap", () => {
  it("caps hand-crafted ids lists at the single-request page size", () => {
    const many = Array.from({ length: 200 }, (_, i) => i + 1).join(",");
    const s = parseState(`?w=2026-W29&ids=${many}`);
    expect(s.ids).toHaveLength(150);
    expect(s.ids[0]).toBe(1);
    expect(s.ids[149]).toBe(150);
  });
});

describe("salt normalization in URLs", () => {
  it("omits whitespace-only salt and trims stored salt", () => {
    const base = { ...parseState("?w=2026-W29") };
    expect(ser({ ...base, salt: "   " })).toBe(ser({ ...base, salt: "" }));
    expect(ser({ ...base, salt: " take2 " })).toContain("salt=take2");
  });
});
import { defaultState, parseState, serializeState } from "./urlState";

describe("parseState / serializeState", () => {
  it("parses an empty query string to defaults", () => {
    const s = parseState("");
    const d = defaultState();
    expect(s).toEqual(d);
  });

  it("round-trips a fully populated state", () => {
    const qs =
      "w=2026-W29&salt=reroll&n=6&q=rain&tags=drone,field-recording&dmin=1&dmax=10&type=aiff,wav&lic=Creative+Commons+0&ids=123,456";
    const s = parseState(qs);
    expect(s.week).toBe("2026-W29");
    expect(s.salt).toBe("reroll");
    expect(s.sampleCount).toBe(6);
    expect(s.filters.query).toBe("rain");
    expect(s.filters.tags).toEqual(["drone", "field-recording"]);
    expect(s.filters.durationMin).toBe(1);
    expect(s.filters.durationMax).toBe(10);
    expect(s.filters.types).toEqual(["aiff", "wav"]);
    expect(s.filters.license).toBe("Creative Commons 0");
    expect(s.ids).toEqual([123, 456]);

    // serialize → parse is identity
    expect(parseState(serializeState(s))).toEqual(s);
  });

  it("omits default values but always pins the week", () => {
    const qs = serializeState(defaultState());
    const params = new URLSearchParams(qs);
    expect(params.get("w")).toBe(defaultState().week);
    expect([...params.keys()]).toEqual(["w"]);
  });

  it("clamps sample count to [3, 6]", () => {
    expect(parseState("n=1").sampleCount).toBe(3);
    expect(parseState("n=99").sampleCount).toBe(6);
  });

  it("rejects invalid weeks and falls back to current", () => {
    expect(parseState("w=banana").week).toBe(defaultState().week);
    expect(parseState("w=2026-W60").week).toBe(defaultState().week);
  });

  it("drops non-numeric and non-positive ids", () => {
    expect(parseState("ids=12,abc,-4,0,7.5,99").ids).toEqual([12, 99]);
  });

  it("supports explicit unbounded duration (empty dmin/dmax)", () => {
    const s = parseState("dmin=&dmax=");
    expect(s.filters.durationMin).toBeNull();
    expect(s.filters.durationMax).toBeNull();
    expect(parseState(serializeState(s))).toEqual(s);
  });
});
