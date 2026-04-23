import { describe, expect, it } from "vitest";
import { geocodeQueryStringFromPlaceParts } from "./geocodePlaceQueryString.js";

describe("geocodeQueryStringFromPlaceParts", () => {
  it("joins unique trimmed parts in locality → admin → country → name order", () => {
    expect(
      geocodeQueryStringFromPlaceParts({
        name: "Hamburg, Germany",
        locality: "Hamburg",
        adminArea: null,
        countryCode: "DE"
      })
    ).toBe("Hamburg, DE, Hamburg, Germany");
  });

  it("dedupes when name repeats locality", () => {
    expect(
      geocodeQueryStringFromPlaceParts({
        name: "Boston",
        locality: "Boston",
        adminArea: "MA",
        countryCode: "US"
      })
    ).toBe("Boston, MA, US");
  });

  it("returns empty string when all parts are blank", () => {
    expect(
      geocodeQueryStringFromPlaceParts({
        name: "   ",
        locality: null,
        adminArea: null,
        countryCode: null
      })
    ).toBe("");
  });
});
