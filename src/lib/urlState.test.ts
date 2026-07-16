import { describe, expect, it } from "vitest";
import { serializeState as ser } from "./urlState";

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
