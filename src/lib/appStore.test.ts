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

  describe("lock-clearing invariant", () => {
    it("clears ids and fires onLockCleared when any control changes under a lock", () => {
      const url = fakeUrl("?w=2026-W29&ids=1,2,3");
      const store = createAppStore(url.adapter);
      const cleared = vi.fn();
      store.onLockCleared(cleared);

      store.update({ salt: "x" });

      expect(store.state.value.ids).toEqual([]);
      expect(cleared).toHaveBeenCalledTimes(1);
      expect(url.writes[0]).not.toContain("ids=");
    });

    it("filter edits under a lock clear it too", () => {
      const url = fakeUrl("?w=2026-W29&ids=7,8,9");
      const store = createAppStore(url.adapter);
      const cleared = vi.fn();
      store.onLockCleared(cleared);

      store.updateFilters({ query: "rain" });

      expect(store.state.value.ids).toEqual([]);
      expect(cleared).toHaveBeenCalledTimes(1);
    });

    it("does not fire when the patch itself carries ids", () => {
      const url = fakeUrl("?w=2026-W29&ids=1,2");
      const store = createAppStore(url.adapter);
      const cleared = vi.fn();
      store.onLockCleared(cleared);

      store.update({ ids: [4, 5, 6] });

      expect(store.state.value.ids).toEqual([4, 5, 6]);
      expect(cleared).not.toHaveBeenCalled();
    });

    it("does not fire when no lock is active", () => {
      const store = createAppStore(fakeUrl("?w=2026-W29").adapter);
      const cleared = vi.fn();
      store.onLockCleared(cleared);
      store.update({ salt: "x" });
      expect(cleared).not.toHaveBeenCalled();
    });

    it("unlock() clears ids and fires", () => {
      const url = fakeUrl("?w=2026-W29&ids=1,2,3");
      const store = createAppStore(url.adapter);
      const cleared = vi.fn();
      store.onLockCleared(cleared);

      store.unlock();

      expect(store.state.value.ids).toEqual([]);
      expect(cleared).toHaveBeenCalledTimes(1);
      expect(url.writes[0]).not.toContain("ids=");
    });
  });

  describe("derived signals", () => {
    it("pins the seed to the golden cross-machine format", () => {
      const store = createAppStore(fakeUrl("?w=2026-W29").adapter);
      expect(store.seed.value).toBe("2026-W29||4||duration:[0.5 TO 30]");
    });

    it("derives canonicalFilter and normalized query reactively", () => {
      const store = createAppStore(fakeUrl("?w=2026-W29").adapter);
      store.updateFilters({ query: "  Ambient  Pad ", types: ["wav"] });
      expect(store.query.value).toBe("ambient pad");
      expect(store.canonicalFilter.value).toBe("duration:[0.5 TO 30] type:wav");
      expect(store.seed.value).toBe(
        "2026-W29||4|ambient pad|duration:[0.5 TO 30] type:wav",
      );
    });
  });
});
