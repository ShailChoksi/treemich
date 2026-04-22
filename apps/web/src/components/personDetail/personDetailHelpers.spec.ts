import { describe, expect, it } from "vitest";
import { formatBirthDate } from "./personDetailHelpers";

describe("formatBirthDate", () => {
  it("returns Unknown for empty values", () => {
    expect(formatBirthDate(null)).toBe("Unknown");
    expect(formatBirthDate(undefined)).toBe("Unknown");
  });

  it("formats date-only strings without timezone day shift", () => {
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(1992, 8, 25)));
    expect(formatBirthDate("1992-09-25")).toBe(expected);
  });

  it("formats ISO datetime strings using UTC day", () => {
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(1992, 8, 25)));
    expect(formatBirthDate("1992-09-25T00:00:00.000Z")).toBe(expected);
  });

  it("falls back to original string for invalid dates", () => {
    expect(formatBirthDate("not-a-date")).toBe("not-a-date");
  });
});
