import { describe, expect, it } from "vitest";
import { entryFromSet, mergeEntry, type HistoryEntry } from "./history";
import type { LockedSlot } from "./resolveSet";

const entry = (url: string, savedAt = 0): HistoryEntry => ({
  url,
  week: "2026-W29",
  savedAt,
  sounds: [{ name: `sound-${url}`, tags: ["x"] }],
});

describe("entryFromSet", () => {
  it("keeps name+tags for real sounds and drops missing slots", () => {
    const slots = [
      { id: 1, name: "kick.wav", tags: ["drum", "kick"] },
      { id: 2, missing: true },
      { id: 3, name: "hat.aiff", tags: ["hat"] },
    ] as unknown as LockedSlot[];
    const e = entryFromSet("u", "2026-W29", slots, 42);
    expect(e).toEqual({
      url: "u",
      week: "2026-W29",
      savedAt: 42,
      sounds: [
        { name: "kick.wav", tags: ["drum", "kick"] },
        { name: "hat.aiff", tags: ["hat"] },
      ],
    });
  });
});

describe("mergeEntry", () => {
  it("prepends the newest entry (most-recent first)", () => {
    const list = mergeEntry(mergeEntry([], entry("a")), entry("b"));
    expect(list.map((e) => e.url)).toEqual(["b", "a"]);
  });

  it("dedupes by url, moving a repeated set to the top", () => {
    let list = [entry("a"), entry("b"), entry("c")];
    list = mergeEntry(list, entry("b", 99));
    expect(list.map((e) => e.url)).toEqual(["b", "a", "c"]);
    // the moved entry is the new one, not the stale copy
    expect(list[0].savedAt).toBe(99);
    expect(list).toHaveLength(3);
  });

  it("caps the length, trimming the oldest", () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < 5; i++) list = mergeEntry(list, entry(`u${i}`, i), 3);
    expect(list.map((e) => e.url)).toEqual(["u4", "u3", "u2"]);
  });
});
