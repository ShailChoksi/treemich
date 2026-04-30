import { describe, expect, it } from "vitest";
import { buildBirthPlaceInput, parseDateInputToParts } from "../lib/lifeEventUi";

describe("parseDateInputToParts", () => {
  it("parses valid yyyy-mm-dd dates", () => {
    expect(parseDateInputToParts("2026-04-21")).toEqual({ year: 2026, month: 4, day: 21 });
  });

  it("rejects malformed or impossible dates", () => {
    expect(parseDateInputToParts("2026-4-21")).toBeNull();
    expect(parseDateInputToParts("not-a-date")).toBeNull();
    expect(parseDateInputToParts("2026-02-30")).toBeNull();
  });
});

describe("buildBirthPlaceInput", () => {
  it("returns null when no values are provided", () => {
    expect(buildBirthPlaceInput(null, null)).toBeNull();
  });

  it("builds locality and normalized country code for 2-letter countries", () => {
    expect(buildBirthPlaceInput("Boston", "us")).toEqual({
      name: "Boston, us",
      locality: "Boston",
      countryCode: "US",
      adminArea: null
    });
  });

  it("keeps non-2-letter country in display name without invalid countryCode", () => {
    expect(buildBirthPlaceInput("Boston", "USA")).toEqual({
      name: "Boston, USA",
      locality: "Boston",
      countryCode: null,
      adminArea: "USA"
    });
  });
});
