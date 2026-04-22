import { describe, expect, it } from "vitest";
import type { LifeEventRecord } from "./api";
import { nullIfEmpty, optionalFloat, optionalInt, summarizeLifeEvent } from "./lifeEventFormHelpers";

describe("optionalInt", () => {
  it("returns null for empty or invalid input", () => {
    expect(optionalInt("")).toBeNull();
    expect(optionalInt("  ")).toBeNull();
    expect(optionalInt("abc")).toBeNull();
  });

  it("parses integers", () => {
    expect(optionalInt("1990")).toBe(1990);
    expect(optionalInt("  42 ")).toBe(42);
  });
});

describe("optionalFloat", () => {
  it("returns null for empty input", () => {
    expect(optionalFloat("")).toBeNull();
  });

  it("parses floats", () => {
    expect(optionalFloat("-12.5")).toBe(-12.5);
    expect(optionalFloat("−12.5")).toBe(-12.5);
    expect(optionalFloat("12,5")).toBe(12.5);
  });

  it("rejects malformed numeric strings", () => {
    expect(optionalFloat("12abc")).toBeNull();
  });
});

describe("nullIfEmpty", () => {
  it("trims and returns null for blank strings", () => {
    expect(nullIfEmpty("")).toBeNull();
    expect(nullIfEmpty("   ")).toBeNull();
  });

  it("returns trimmed text when present", () => {
    expect(nullIfEmpty("  x  ")).toBe("x");
  });
});

describe("summarizeLifeEvent", () => {
  const base = (): LifeEventRecord => ({
    id: "e1",
    eventType: "BIRTH",
    dateQualifier: "EXACT",
    year: 1991,
    month: 5,
    day: 6,
    endYear: null,
    endMonth: null,
    endDay: null,
    notes: null,
    place: null,
    citations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });

  it("includes type label and y-m-d when present", () => {
    expect(summarizeLifeEvent(base())).toContain("Birth");
    expect(summarizeLifeEvent(base())).toContain("1991-05-06");
  });

  it("shows qualifier when not EXACT", () => {
    expect(summarizeLifeEvent({ ...base(), dateQualifier: "ABOUT" })).toContain("(ABOUT)");
  });
});
