import { describe, expect, it, vi } from "vitest";
import { createOnsetsCache } from "./onsetsCache";
import { API_BASE, type Transport } from "./freesound";

const settle = () => new Promise((r) => setTimeout(r, 0));

const respond = (status: number, body?: unknown): Transport =>
  vi.fn(async () => ({ status, json: async () => body }));

describe("createOnsetsCache", () => {
  it("fetches once, caches onset times, and reports them", async () => {
    const transport = respond(200, { onset_times: [0.058, 1.416], bpm: 105 });
    const c = createOnsetsCache(transport);

    expect(c.onsetsFor(7)).toBeUndefined();
    c.ensureOnsets(7);
    c.ensureOnsets(7); // in-flight dedupe
    await settle();

    expect(c.onsetsFor(7)).toEqual([0.058, 1.416]);
    c.ensureOnsets(7); // cached — no refetch
    expect(transport).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transport).mock.calls[0][0]).toBe(
      `${API_BASE}/sounds/7/analysis/`,
    );
  });

  it("caches 404 (no analysis) as permanently unavailable", async () => {
    const transport = respond(404);
    const c = createOnsetsCache(transport);
    c.ensureOnsets(7);
    await settle();
    expect(c.onsetsFor(7)).toBeNull();
    c.ensureOnsets(7);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("leaves transient failures uncached so a later interaction retries", async () => {
    const transport = vi.fn<Transport>(async () => {
      throw new Error("network down");
    });
    const c = createOnsetsCache(transport);
    c.ensureOnsets(7);
    await settle();
    expect(c.onsetsFor(7)).toBeUndefined();
    c.ensureOnsets(7); // retry allowed
    await settle();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("treats malformed or empty onset payloads as unavailable", async () => {
    const c = createOnsetsCache(respond(200, { onset_times: "nope" }));
    c.ensureOnsets(1);
    const c2 = createOnsetsCache(respond(200, { onset_times: [] }));
    c2.ensureOnsets(2);
    await settle();
    expect(c.onsetsFor(1)).toBeNull();
    expect(c2.onsetsFor(2)).toBeNull();
  });
});
