import { describe, expect, it } from "vitest";
import {
  compareLifeEventDates,
  isValidYmd,
  lifeEventDateSortKey,
  parseIsoDateToParts,
  partialDateToComparableDate,
  partialDateToIsoString,
  validatePartialDateTriplet
} from "./dateValue.js";

describe("dateValue", () => {
  it("parses ISO date to parts", () => {
    expect(parseIsoDateToParts("1990-05-15")).toEqual({ year: 1990, month: 5, day: 15 });
    expect(parseIsoDateToParts("")).toBeNull();
    expect(parseIsoDateToParts("bad")).toBeNull();
  });

  it("validates partial date triplets", () => {
    expect(validatePartialDateTriplet(1990, 5, 15)).toBeNull();
    expect(validatePartialDateTriplet(1990, 5, null)).toBeNull();
    expect(validatePartialDateTriplet(1990, null, null)).toBeNull();
    expect(validatePartialDateTriplet(null, 5, 15)).toMatch(/year/);
    expect(validatePartialDateTriplet(1990, null, 15)).toMatch(/month/);
  });

  it("rejects invalid calendar dates", () => {
    expect(isValidYmd(2023, 2, 29)).toBe(false);
    expect(isValidYmd(2024, 2, 29)).toBe(true);
  });

  it("builds sort keys and compares", () => {
    expect(lifeEventDateSortKey({ year: 2000, month: 1, day: 1 })).toBe(20000101);
    expect(
      compareLifeEventDates({ year: 1999, month: 12, day: 31 }, { year: 2000, month: 1, day: 1 })
    ).toBeLessThan(0);
  });

  it("serializes full partial date to ISO", () => {
    expect(partialDateToIsoString({ year: 1985, month: 2, day: 3 })).toBe("1985-02-03");
    expect(partialDateToIsoString({ year: 1985, month: 2, day: null })).toBeNull();
  });

  it("partialDateToComparableDate uses midpoints for incomplete dates", () => {
    const y = partialDateToComparableDate({ year: 2000, month: null, day: null });
    expect(y?.getUTCFullYear()).toBe(2000);
    const ym = partialDateToComparableDate({ year: 2000, month: 6, day: null });
    expect(ym?.getUTCMonth()).toBe(5);
  });
});
