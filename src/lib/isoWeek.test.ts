import { describe, expect, it } from "vitest";
import { isValidIsoWeek, isoWeekString, isoWeeksInYear, shiftIsoWeek } from "./isoWeek";

describe("isoWeekString", () => {
  it("matches known ISO week facts", () => {
    expect(isoWeekString(new Date(2026, 6, 16))).toBe("2026-W29"); // Thu 2026-07-16
    expect(isoWeekString(new Date(2026, 0, 1))).toBe("2026-W01"); // Thu 2026-01-01
    expect(isoWeekString(new Date(2027, 0, 1))).toBe("2026-W53"); // Fri → still 2026-W53
    expect(isoWeekString(new Date(2024, 11, 30))).toBe("2025-W01"); // Mon → next ISO year
  });

  it("week starts Monday: Sun and Mon differ", () => {
    expect(isoWeekString(new Date(2026, 6, 12))).toBe("2026-W28"); // Sun
    expect(isoWeekString(new Date(2026, 6, 13))).toBe("2026-W29"); // Mon
  });
});

describe("isoWeeksInYear", () => {
  it("knows 53-week years", () => {
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2027)).toBe(52);
  });
});

describe("isValidIsoWeek", () => {
  it("validates format and week range", () => {
    expect(isValidIsoWeek("2026-W29")).toBe(true);
    expect(isValidIsoWeek("2026-W53")).toBe(true);
    expect(isValidIsoWeek("2025-W53")).toBe(false);
    expect(isValidIsoWeek("2026-W00")).toBe(false);
    expect(isValidIsoWeek("2026-w29")).toBe(false);
    expect(isValidIsoWeek("banana")).toBe(false);
  });
});

describe("shiftIsoWeek", () => {
  it("steps within a year", () => {
    expect(shiftIsoWeek("2026-W29", 1)).toBe("2026-W30");
    expect(shiftIsoWeek("2026-W29", -1)).toBe("2026-W28");
  });

  it("crosses year boundaries respecting 52/53-week years", () => {
    expect(shiftIsoWeek("2026-W53", 1)).toBe("2027-W01");
    expect(shiftIsoWeek("2027-W01", -1)).toBe("2026-W53");
    expect(shiftIsoWeek("2025-W52", 1)).toBe("2026-W01");
    expect(shiftIsoWeek("2026-W01", -1)).toBe("2025-W52");
  });
});
