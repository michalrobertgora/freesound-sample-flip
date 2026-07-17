import { describe, expect, it } from "vitest";
import { seedString } from "./filters";
import { drawDistinctIndices, quantizeCount, seededRng } from "./prng";
import type { Transport } from "./freesound";
import {
  INDEX_CAP,
  PAGE_SIZE,
  SOUND_FIELDS,
  resolveLockedSet,
  resolveSeededSet,
} from "./resolveSet";
import { parseState, type AppState } from "./urlState";

/** App state as parsed from a URL query string. */
function state(search: string): AppState {
  return parseState(search);
}

/**
 * Fake Freesound: a stable database of `available` sounds in created_asc
 * order, reporting `reportedCount` (defaults to available). Sound at global
 * index i has id 100000+i, so tests can predict ids from draws.
 */
function makeApi(reportedCount: number, available = reportedCount) {
  const calls: URL[] = [];
  const transport: Transport = async (url) => {
    const u = new URL(url);
    calls.push(u);
    if (u.searchParams.get("token") === "BAD") {
      return { status: 401, json: async () => ({}) };
    }
    const pageSize = Number(u.searchParams.get("page_size"));
    const page = Number(u.searchParams.get("page") ?? "1");
    const start = (page - 1) * pageSize;
    const results: Array<{ id: number; name: string; username: string }> = [];
    for (let i = start; i < Math.min(start + pageSize, available); i++) {
      results.push({ id: 100000 + i, name: `sound-${i}`, username: `user-${i % 7}` });
    }
    return { status: 200, json: async () => ({ count: reportedCount, results }) };
  };
  const pageCalls = () => calls.filter((u) => u.searchParams.has("page"));
  return { transport, calls, pageCalls };
}

/** The draws resolveSeededSet should make for this state and count. */
function expectedIndices(s: AppState, count: number): number[] {
  const seed = seedString(s.week, s.salt, s.sampleCount, s.filters);
  const range = Math.min(quantizeCount(count), INDEX_CAP);
  return drawDistinctIndices(seededRng(seed), s.sampleCount, range);
}

const W = "w=2026-W29";

describe("resolveSeededSet request construction", () => {
  it("fetches pages with created_asc sort, max page size, display fields, token", async () => {
    const api = makeApi(8412);
    const r = await resolveSeededSet(api.transport, "TOK", state(`?${W}`));
    expect(r.ok).toBe(true);
    for (const u of api.pageCalls()) {
      expect(u.searchParams.get("sort")).toBe("created_asc");
      expect(u.searchParams.get("page_size")).toBe(String(PAGE_SIZE));
      expect(u.searchParams.get("fields")).toBe(SOUND_FIELDS);
      expect(u.searchParams.get("token")).toBe("TOK");
      expect(u.searchParams.get("filter")).toBe(
        'category:("Instrument samples" OR "Music" OR "Sound effects" OR "Soundscapes") ' +
          "duration:[0.5 TO 30] type:(mp3 OR wav)",
      );
    }
  });

  it("groups draws by page: one count request plus one request per distinct page", async () => {
    const api = makeApi(8412);
    const s = state(`?${W}`);
    await resolveSeededSet(api.transport, "TOK", s);
    const pages = new Set(
      expectedIndices(s, 8412).map((i) => Math.floor(i / PAGE_SIZE) + 1),
    );
    expect(api.pageCalls().length).toBe(pages.size);
    expect(api.calls.length).toBe(1 + pages.size);
  });
});

describe("resolveSeededSet determinism", () => {
  it("same state resolves to the same sounds in the same order, every time", async () => {
    const s = state(`?${W}&salt=take2&q=rain`);
    const a = await resolveSeededSet(makeApi(8412).transport, "TOK", s);
    const b = await resolveSeededSet(makeApi(8412).transport, "TOK", s);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.sounds.map((x) => x.id)).toEqual(b.sounds.map((x) => x.id));
    expect(a.sounds).toHaveLength(4);
  });

  it("returns sounds in draw order, not index order", async () => {
    const s = state(`?${W}`);
    const r = await resolveSeededSet(makeApi(8412).transport, "TOK", s);
    if (!r.ok) throw new Error("expected ok");
    expect(r.sounds.map((x) => x.id)).toEqual(
      expectedIndices(s, 8412).map((i) => 100000 + i),
    );
  });

  it("quantization absorbs mid-week count drift", async () => {
    const s = state(`?${W}`);
    const monday = await resolveSeededSet(makeApi(8412).transport, "TOK", s);
    const wednesday = await resolveSeededSet(makeApi(8431).transport, "TOK", s);
    if (!monday.ok || !wednesday.ok) throw new Error("expected ok");
    expect(monday.sounds.map((x) => x.id)).toEqual(
      wednesday.sounds.map((x) => x.id),
    );
  });

  it("caps the draw range at INDEX_CAP for huge result sets", async () => {
    const api = makeApi(5_000_000);
    const r = await resolveSeededSet(api.transport, "TOK", state(`?${W}`));
    expect(r.ok).toBe(true);
    const maxPage = Math.ceil(INDEX_CAP / PAGE_SIZE);
    for (const u of api.pageCalls()) {
      expect(Number(u.searchParams.get("page"))).toBeLessThanOrEqual(maxPage);
    }
  });
});

describe("resolveSeededSet edge cases and errors", () => {
  it("returns fewer sounds when fewer exist than requested", async () => {
    const r = await resolveSeededSet(makeApi(3).transport, "TOK", state(`?${W}`));
    if (!r.ok) throw new Error("expected ok");
    expect(r.sounds.map((x) => x.id).sort()).toEqual([100000, 100001, 100002]);
  });

  it("maps zero matching sounds to zero-results without fetching pages", async () => {
    const api = makeApi(0);
    const r = await resolveSeededSet(api.transport, "TOK", state(`?${W}`));
    expect(r).toEqual({ ok: false, error: { kind: "zero-results" } });
    expect(api.calls.length).toBe(1);
  });

  it("propagates auth failure from the count request", async () => {
    const r = await resolveSeededSet(makeApi(100).transport, "BAD", state(`?${W}`));
    expect(r).toEqual({ ok: false, error: { kind: "invalid-key" } });
  });

  it("surfaces a page-level 429 as rate-limited, never a silent partial set", async () => {
    const transport: Transport = async (url) => {
      const u = new URL(url);
      if (u.searchParams.has("page")) {
        return { status: 429, json: async () => ({ detail: "throttled" }) };
      }
      return { status: 200, json: async () => ({ count: 8412, results: [{}] }) };
    };
    const r = await resolveSeededSet(transport, "TOK", state(`?${W}`));
    expect(r).toEqual({
      ok: false,
      error: { kind: "rate-limited", detail: "throttled" },
    });
  });

  it("surfaces a drawn index missing from its page as partial-fetch", async () => {
    // API claims 8412 sounds but only 2000 actually come back (deletions).
    const api = makeApi(8412, 2000);
    const r = await resolveSeededSet(api.transport, "TOK", state(`?${W}`));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error.kind).toBe("partial-fetch");
  });
});

/** Fake for locked mode: knows these sounds, returns them in id order. */
function makeLockedApi(existingIds: number[]) {
  const calls: URL[] = [];
  const transport: Transport = async (url) => {
    const u = new URL(url);
    calls.push(u);
    if (u.searchParams.get("token") === "BAD") {
      return { status: 401, json: async () => ({}) };
    }
    const m = /^id:\((.+)\)$/.exec(u.searchParams.get("filter") ?? "");
    const asked = m ? m[1].split(" OR ").map(Number) : [];
    const found = asked
      .filter((id) => existingIds.includes(id))
      .sort((a, b) => a - b)
      .map((id) => ({ id, name: `sound-${id}`, username: "u" }));
    return { status: 200, json: async () => ({ count: found.length, results: found }) };
  };
  return { transport, calls };
}

describe("resolveLockedSet", () => {
  it("makes exactly one ID-filtered request: no count, no seed, no sort", async () => {
    const api = makeLockedApi([301, 302, 303]);
    const r = await resolveLockedSet(api.transport, "TOK", [302, 301, 303]);
    expect(r.ok).toBe(true);
    expect(api.calls).toHaveLength(1);
    const u = api.calls[0];
    expect(u.searchParams.get("filter")).toBe("id:(302 OR 301 OR 303)");
    expect(u.searchParams.get("fields")).toBe(SOUND_FIELDS);
    expect(u.searchParams.get("token")).toBe("TOK");
    expect(u.searchParams.has("sort")).toBe(false);
    expect(u.searchParams.has("query")).toBe(false);
  });

  it("reorders the response to the requested (draw) order", async () => {
    const api = makeLockedApi([301, 302, 303]);
    const r = await resolveLockedSet(api.transport, "TOK", [303, 301, 302]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.slots.map((s) => s.id)).toEqual([303, 301, 302]);
  });

  it("renders a missing id as an explicit placeholder while the rest load", async () => {
    const api = makeLockedApi([301, 303]);
    const r = await resolveLockedSet(api.transport, "TOK", [303, 302, 301]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.slots.map((s) => ("missing" in s ? `gone-${s.id}` : s.id))).toEqual([
      303,
      "gone-302",
      301,
    ]);
  });

  it("propagates auth failure", async () => {
    const api = makeLockedApi([301]);
    const r = await resolveLockedSet(api.transport, "BAD", [301]);
    expect(r).toEqual({ ok: false, error: { kind: "invalid-key" } });
  });
});

