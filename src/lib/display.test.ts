import { describe, expect, it } from "vitest";
import { formatDuration, formatSampleRate, licenseLabel } from "./display";

describe("licenseLabel", () => {
  it("maps Creative Commons license URLs to short badges", () => {
    expect(licenseLabel("http://creativecommons.org/publicdomain/zero/1.0/")).toBe("CC0");
    expect(licenseLabel("https://creativecommons.org/licenses/by/4.0/")).toBe("CC-BY");
    expect(licenseLabel("http://creativecommons.org/licenses/by-nc/3.0/")).toBe("CC-BY-NC");
    expect(licenseLabel("http://creativecommons.org/licenses/by-nc-sa/3.0/")).toBe("CC-BY-NC-SA");
    expect(licenseLabel("http://creativecommons.org/licenses/by-sa/4.0/")).toBe("CC-BY-SA");
    expect(licenseLabel("http://creativecommons.org/licenses/sampling+/1.0/")).toBe("Sampling+");
  });

  it("passes through unrecognized values unchanged", () => {
    expect(licenseLabel("Some Custom License")).toBe("Some Custom License");
    expect(licenseLabel("")).toBe("");
  });
});

describe("formatDuration", () => {
  it("shows sub-minute durations in seconds with one decimal", () => {
    expect(formatDuration(7.31)).toBe("7.3s");
    expect(formatDuration(0.5)).toBe("0.5s");
    expect(formatDuration(59.94)).toBe("59.9s");
  });

  it("shows minute durations as m:ss", () => {
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(125.7)).toBe("2:06");
  });
});

describe("formatSampleRate", () => {
  it("formats Hz as kHz", () => {
    expect(formatSampleRate(44100)).toBe("44.1 kHz");
    expect(formatSampleRate(48000)).toBe("48 kHz");
    expect(formatSampleRate(96000)).toBe("96 kHz");
  });
});
