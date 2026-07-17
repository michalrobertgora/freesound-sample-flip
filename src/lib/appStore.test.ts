import { describe, expect, it, vi } from "vitest";
import { createAppStore, type UrlAdapter } from "./appStore";

/** Recording fake for the URL adapter seam. */
function fakeUrl(initial = "?w=2026-W29") {
  let current = initial;
  const writes: string[] = [];
  let external: (() => void) | undefined;
  const adapter: UrlAdapter = {
    read: () => current,
    write: (qs) => {
      current = `?${qs}`;
      writes.push(qs);
    },
    onExternalChange: (handler) => {
      external = handler;
    },
  };
  return {
    adapter,
    writes,
    /** Simulate browser back/forward landing on `search`. */
    navigate(search: string) {
      current = search;
      external?.();
    },
  };
}

describe("createAppStore", () => {
  it("parses the initial URL into state", () => {
    const store = createAppStore(fakeUrl("?w=2026-W29&q=rain&n=5").adapter);
    expect(store.state.value.week).toBe("2026-W29");
    expect(store.state.value.filters.query).toBe("rain");
    expect(store.state.value.sampleCount).toBe(5);
  });

  it("writes every update back to the URL", () => {
    const url = fakeUrl();
    const store = createAppStore(url.adapter);
    store.update({ salt: "take2" });
    store.updateFilters({ query: "rain" });
    expect(url.writes).toHaveLength(2);
    expect(url.writes[1]).toContain("salt=take2");
    expect(url.writes[1]).toContain("q=rain");
  });

  it("stores salt raw while the URL carries it trimmed", () => {
    const url = fakeUrl();
    const store = createAppStore(url.adapter);
    store.update({ salt: " take2 " });
    expect(store.state.value.salt).toBe(" take2 ");
    expect(url.writes[0]).toContain("salt=take2");
  });

  it("re-parses state on external (back/forward) navigation", () => {
    const url = fakeUrl("?w=2026-W29");
    const store = createAppStore(url.adapter);
    url.navigate("?w=2026-W28&q=drone");
    expect(store.state.value.week).toBe("2026-W28");
    expect(store.state.value.filters.query).toBe("drone");
  });

  describe("explicit unlock", () => {
    it("keeps the lock when other controls change (no auto-clear on edit)", () => {
      const url = fakeUrl("?w=2026-W29&ids=1,2,3");
      const store = createAppStore(url.adapter);
      const cleared = vi.fn();
      store.onLockCleared(cleared);

      store.update({ salt: "x" });
      store.updateFilters({ query: "rain" });

      expect(store.state.value.ids).toEqual([1, 2, 3]);
      expect(cleared).not.toHaveBeenCalled();
    });

    it("unlock() clears ids, fires onLockCleared, and drops ids from the URL", () => {
      const url = fakeUrl("?w=2026-W29&ids=1,2,3");
      const store = createAppStore(url.adapter);
      const cleared = vi.fn();
      store.onLockCleared(cleared);

      store.unlock();

      expect(store.state.value.ids).toEqual([]);
      expect(cleared).toHaveBeenCalledTimes(1);
      expect(url.writes[0]).not.toContain("ids=");
    });

    it("setting ids replaces the lock without firing onLockCleared", () => {
      const url = fakeUrl("?w=2026-W29&ids=1,2");
      const store = createAppStore(url.adapter);
      const cleared = vi.fn();
      store.onLockCleared(cleared);

      store.update({ ids: [4, 5, 6] });

      expect(store.state.value.ids).toEqual([4, 5, 6]);
      expect(cleared).not.toHaveBeenCalled();
    });
  });

  describe("derived signals", () => {
    it("pins the seed to the golden cross-machine format", () => {
      const store = createAppStore(fakeUrl("?w=2026-W29").adapter);
      // Ticket 08+10 seed breaks: pristine defaults now include
      // type:(mp3 OR wav) and the 4-of-5 category clause.
      expect(store.seed.value).toBe(
        '2026-W29||4||category:("Instrument samples" OR "Music" OR "Sound effects" OR "Soundscapes") ' +
          "duration:[0.5 TO 30] type:(mp3 OR wav)",
      );
    });

    it("derives canonicalFilter and normalized query reactively", () => {
      const store = createAppStore(fakeUrl("?w=2026-W29").adapter);
      store.updateFilters({ query: "  Ambient  Pad ", types: ["wav"] });
      expect(store.query.value).toBe("ambient pad");
      const catDefault =
        'category:("Instrument samples" OR "Music" OR "Sound effects" OR "Soundscapes")';
      expect(store.canonicalFilter.value).toBe(
        `${catDefault} duration:[0.5 TO 30] type:wav`,
      );
      expect(store.seed.value).toBe(
        `2026-W29||4|ambient pad|${catDefault} duration:[0.5 TO 30] type:wav`,
      );
    });
  });
});
