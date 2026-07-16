import { describe, expect, it, vi } from "vitest";
import {
  buildCountUrl,
  fetchCount,
  makeCachedCountFetcher,
  type Transport,
} from "./freesound";

/** Transport that always answers with the given status/body. */
function fakeTransport(status: number, body: unknown): Transport {
  return async () => ({ status, json: async () => body });
}

describe("buildCountUrl", () => {
  it("requests one result with only the count-relevant params", () => {
    const url = buildCountUrl("SECRET", "ambient pad", "duration:[0.5 TO 30]");
    expect(url).toBe(
      "https://freesound.org/apiv2/search/?page_size=1&fields=id&query=ambient+pad&filter=duration%3A%5B0.5+TO+30%5D&token=SECRET",
    );
  });

  it("omits empty query and empty filter", () => {
    const url = buildCountUrl("SECRET", "", "");
    expect(url).toBe(
      "https://freesound.org/apiv2/search/?page_size=1&fields=id&token=SECRET",
    );
  });
});

describe("fetchCount", () => {
  it("returns the count on success", async () => {
    const t = fakeTransport(200, { count: 8412, results: [] });
    expect(await fetchCount(t, "k", "", "")).toEqual({ ok: true, count: 8412 });
  });

  it("maps 401 to invalid-key", async () => {
    const t = fakeTransport(401, { detail: "Invalid token." });
    expect(await fetchCount(t, "bad", "", "")).toEqual({
      ok: false,
      error: { kind: "invalid-key" },
    });
  });

  it("maps 429 to rate-limited and surfaces the detail message", async () => {
    const t = fakeTransport(429, {
      detail: "Request was throttled. Expected available in 42 seconds.",
    });
    expect(await fetchCount(t, "k", "", "")).toEqual({
      ok: false,
      error: {
        kind: "rate-limited",
        detail: "Request was throttled. Expected available in 42 seconds.",
      },
    });
  });

  it("maps other failures to unexpected", async () => {
    const t500 = fakeTransport(500, {});
    expect(await fetchCount(t500, "k", "", "")).toEqual({
      ok: false,
      error: { kind: "unexpected", message: "HTTP 500" },
    });

    const tThrow: Transport = async () => {
      throw new Error("offline");
    };
    expect(await fetchCount(tThrow, "k", "", "")).toEqual({
      ok: false,
      error: { kind: "unexpected", message: "offline" },
    });

    const tMalformed = fakeTransport(200, { results: [] });
    const r = await fetchCount(tMalformed, "k", "", "");
    expect(r.ok).toBe(false);
  });
});

describe("makeCachedCountFetcher", () => {
  it("hits the transport once per (query, filter) pair", async () => {
    const spy = vi.fn(fakeTransport(200, { count: 7 }));
    const cached = makeCachedCountFetcher(spy);

    expect(await cached("k", "rain", "duration:[0.5 TO 30]")).toEqual({
      ok: true,
      count: 7,
    });
    expect(await cached("k", "rain", "duration:[0.5 TO 30]")).toEqual({
      ok: true,
      count: 7,
    });
    expect(spy).toHaveBeenCalledTimes(1);

    await cached("k", "rain", "duration:[0.5 TO 20]");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not cache errors", async () => {
    let status = 429;
    const spy = vi.fn(async () => ({
      status,
      json: async () => (status === 429 ? { detail: "throttled" } : { count: 3 }),
    }));
    const cached = makeCachedCountFetcher(spy);

    expect((await cached("k", "", "")).ok).toBe(false);
    status = 200;
    expect(await cached("k", "", "")).toEqual({ ok: true, count: 3 });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
