import { describe, expect, it } from "vitest";
import { normalizeImmichBirthDate } from "./birthDate.js";

describe("normalizeImmichBirthDate", () => {
  it("treats a missing value, null, and an empty string as absent", () => {
    expect(normalizeImmichBirthDate(undefined)).toEqual({ kind: "absent" });
    expect(normalizeImmichBirthDate(null)).toEqual({ kind: "absent" });
    expect(normalizeImmichBirthDate("")).toEqual({ kind: "absent" });
  });

  it("accepts a real calendar date, including February 29 in a leap year", () => {
    expect(normalizeImmichBirthDate("1815-12-10")).toEqual({
      kind: "full",
      year: 1815,
      month: 12,
      day: 10
    });
    expect(normalizeImmichBirthDate("2024-02-29")).toEqual({
      kind: "full",
      year: 2024,
      month: 2,
      day: 29
    });
  });

  it("reads a full date from the v1.125–v1.129 UTC midnight timestamp", () => {
    expect(normalizeImmichBirthDate("1815-12-10T00:00:00.000Z")).toEqual({
      kind: "full",
      year: 1815,
      month: 12,
      day: 10
    });
  });

  it("rejects every other timestamp, including an offset, as malformed", () => {
    expect(normalizeImmichBirthDate("1815-12-10T00:00:00.000+00:00")).toEqual({
      kind: "malformed",
      raw: "1815-12-10T00:00:00.000+00:00"
    });
    expect(normalizeImmichBirthDate("1815-12-10T00:00:00Z")).toEqual({
      kind: "malformed",
      raw: "1815-12-10T00:00:00Z"
    });
  });

  it("rejects an impossible day and keeps the raw string", () => {
    expect(normalizeImmichBirthDate("2023-02-29")).toEqual({ kind: "malformed", raw: "2023-02-29" });
    expect(normalizeImmichBirthDate("2023-02-29T00:00:00.000Z")).toEqual({
      kind: "malformed",
      raw: "2023-02-29T00:00:00.000Z"
    });
    expect(normalizeImmichBirthDate("not-a-date")).toEqual({ kind: "malformed", raw: "not-a-date" });
  });
});
