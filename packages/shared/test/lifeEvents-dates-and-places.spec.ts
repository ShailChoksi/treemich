import { describe, expect, it } from "vitest";
import {
  createLifeEventBodySchema,
  dateQualifierSchema,
  lifeEventTypeSchema,
  partialDatePartsSchema,
  patchLifeEventBodySchema,
  personAttachableLifeEventTypeValues,
  placeInputSchema
} from "../src/lifeEvents.js";

describe("lifeEventTypeSchema and person-attachable types", () => {
  it("accepts known event types", () => {
    expect(lifeEventTypeSchema.parse("BIRTH")).toBe("BIRTH");
    expect(lifeEventTypeSchema.parse("CENSUS")).toBe("CENSUS");
  });

  it("excludes marriage and divorce from person-attachable list", () => {
    expect(personAttachableLifeEventTypeValues).not.toContain("MARRIAGE");
    expect(personAttachableLifeEventTypeValues).not.toContain("DIVORCE");
    expect(personAttachableLifeEventTypeValues).toContain("BIRTH");
  });
});

describe("dateQualifierSchema and partial dates", () => {
  it("accepts BETWEEN and partial date parts", () => {
    expect(dateQualifierSchema.parse("BETWEEN")).toBe("BETWEEN");
    expect(partialDatePartsSchema.parse({ year: 1900, endYear: 1901 })).toEqual({
      year: 1900,
      endYear: 1901
    });
  });

  it("rejects invalid calendar bounds", () => {
    expect(() => partialDatePartsSchema.parse({ month: 13 })).toThrow();
    expect(() => partialDatePartsSchema.parse({ day: 32 })).toThrow();
  });
});

describe("placeInputSchema", () => {
  it("requires name and enforces country code length", () => {
    expect(() => placeInputSchema.parse({ name: "" })).toThrow();
    expect(() =>
      placeInputSchema.parse({
        name: "Town",
        countryCode: "USA"
      })
    ).toThrow();
    expect(
      placeInputSchema.parse({
        name: "Town",
        countryCode: "US",
        locality: "Somewhere"
      })
    ).toMatchObject({ countryCode: "US" });
  });
});

describe("createLifeEventBodySchema", () => {
  it("accepts BETWEEN when an end date part is present", () => {
    expect(
      createLifeEventBodySchema.parse({
        eventType: "RESIDENCE",
        dateQualifier: "BETWEEN",
        year: 1920,
        endYear: 1925
      })
    ).toMatchObject({ dateQualifier: "BETWEEN", endYear: 1925 });
  });

  it("rejects BETWEEN without any end date fields", () => {
    expect(() =>
      createLifeEventBodySchema.parse({
        eventType: "RESIDENCE",
        dateQualifier: "BETWEEN",
        year: 1920
      })
    ).toThrow(/BETWEEN qualifier requires/);
  });
});

describe("patchLifeEventBodySchema", () => {
  it("parses an empty patch object", () => {
    expect(patchLifeEventBodySchema.parse({})).toEqual({});
  });

  it("rejects placeId together with inline place", () => {
    expect(() =>
      patchLifeEventBodySchema.parse({
        placeId: "pl-1",
        place: { name: "X" }
      })
    ).toThrow(/only one of placeId or place/);
  });

  it("rejects explicit empty-string customLabel on patch", () => {
    expect(() =>
      patchLifeEventBodySchema.parse({
        customLabel: ""
      })
    ).toThrow(/customLabel cannot be empty/);
  });

  it("allows customLabel null on patch (omit vs clear handled server-side)", () => {
    expect(patchLifeEventBodySchema.parse({ customLabel: null })).toEqual({ customLabel: null });
  });
});
