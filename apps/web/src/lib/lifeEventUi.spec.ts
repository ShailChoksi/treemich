import { describe, expect, it } from "vitest";
import type { LifeEventRecord } from "./api";
import {
  deriveProfileDisplayValuesFromLifeEvents,
  deriveSpouseDatesFromRelationshipEvents
} from "./lifeEventUi";

const marriageEvent = (y: number, m: number, d: number): LifeEventRecord => ({
  id: "ev-m",
  eventType: "MARRIAGE",
  customLabel: null,
  dateQualifier: "EXACT",
  year: y,
  month: m,
  day: d,
  endYear: null,
  endMonth: null,
  endDay: null,
  notes: null,
  place: null,
  citations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
});

const divorceEvent = (y: number, m: number, d: number): LifeEventRecord => ({
  id: "ev-d",
  eventType: "DIVORCE",
  customLabel: null,
  dateQualifier: "EXACT",
  year: y,
  month: m,
  day: d,
  endYear: null,
  endMonth: null,
  endDay: null,
  notes: null,
  place: null,
  citations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
});

describe("deriveSpouseDatesFromRelationshipEvents", () => {
  it("returns empty strings when no marriage or divorce events exist", () => {
    expect(deriveSpouseDatesFromRelationshipEvents([])).toEqual({
      marriage: "",
      divorce: ""
    });
  });

  it("uses MARRIAGE and DIVORCE events when present", () => {
    expect(
      deriveSpouseDatesFromRelationshipEvents([marriageEvent(2011, 7, 8), divorceEvent(2021, 9, 10)])
    ).toEqual({
      marriage: "2011-07-08",
      divorce: "2021-09-10"
    });
  });

  it("returns empty marriage when only divorce event exists", () => {
    expect(deriveSpouseDatesFromRelationshipEvents([divorceEvent(2021, 9, 10)])).toEqual({
      marriage: "",
      divorce: "2021-09-10"
    });
  });
});

describe("deriveProfileDisplayValuesFromLifeEvents", () => {
  it("returns empty fields when life events are not loaded", () => {
    expect(deriveProfileDisplayValuesFromLifeEvents(undefined)).toEqual({
      birthDate: "",
      deathDate: "",
      birthCity: "",
      birthCountry: ""
    });
  });

  it("returns empty fields when there are no BIRTH or DEATH events", () => {
    expect(deriveProfileDisplayValuesFromLifeEvents([])).toEqual({
      birthDate: "",
      deathDate: "",
      birthCity: "",
      birthCountry: ""
    });
  });

  it("derives quick-edit fields from BIRTH and DEATH events", () => {
    const lifeEvents: LifeEventRecord[] = [
      {
        id: "ev-birth",
        eventType: "BIRTH",
        customLabel: null,
        dateQualifier: "EXACT",
        year: 1991,
        month: 5,
        day: 6,
        endYear: null,
        endMonth: null,
        endDay: null,
        notes: null,
        place: {
          id: "pl-1",
          name: "Boston, US",
          locality: "Boston",
          countryCode: "US",
          addressLine1: null,
          adminArea: null,
          postalCode: null,
          latitude: null,
          longitude: null,
          notes: null
        },
        citations: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "ev-death",
        eventType: "DEATH",
        customLabel: null,
        dateQualifier: "EXACT",
        year: 2021,
        month: 7,
        day: 8,
        endYear: null,
        endMonth: null,
        endDay: null,
        notes: null,
        place: null,
        citations: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    expect(deriveProfileDisplayValuesFromLifeEvents(lifeEvents)).toEqual({
      birthDate: "1991-05-06",
      deathDate: "2021-07-08",
      birthCity: "Boston",
      birthCountry: "US"
    });
  });

  it("uses empty date strings when BIRTH exists without full y/m/d", () => {
    const lifeEvents: LifeEventRecord[] = [
      {
        id: "ev-birth",
        eventType: "BIRTH",
        customLabel: null,
        dateQualifier: "EXACT",
        year: 1991,
        month: null,
        day: null,
        endYear: null,
        endMonth: null,
        endDay: null,
        notes: null,
        place: null,
        citations: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    expect(deriveProfileDisplayValuesFromLifeEvents(lifeEvents)).toEqual({
      birthDate: "",
      deathDate: "",
      birthCity: "",
      birthCountry: ""
    });
  });

  it("shows birth country from adminArea when countryCode is absent", () => {
    const lifeEvents: LifeEventRecord[] = [
      {
        id: "ev-birth",
        eventType: "BIRTH",
        customLabel: null,
        dateQualifier: "EXACT",
        year: 1991,
        month: 5,
        day: 6,
        endYear: null,
        endMonth: null,
        endDay: null,
        notes: null,
        place: {
          id: "pl-1",
          name: "Munich, Germany",
          locality: "Munich",
          countryCode: null,
          addressLine1: null,
          adminArea: "Germany",
          postalCode: null,
          latitude: null,
          longitude: null,
          notes: null
        },
        citations: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    expect(deriveProfileDisplayValuesFromLifeEvents(lifeEvents).birthCountry).toBe("Germany");
  });

  it("falls back to country segment of place.name when code and adminArea are missing", () => {
    const lifeEvents: LifeEventRecord[] = [
      {
        id: "ev-birth",
        eventType: "BIRTH",
        customLabel: null,
        dateQualifier: "EXACT",
        year: null,
        month: null,
        day: null,
        endYear: null,
        endMonth: null,
        endDay: null,
        notes: null,
        place: {
          id: "pl-1",
          name: "Hamburg, Germany",
          locality: "Hamburg",
          countryCode: null,
          addressLine1: null,
          adminArea: null,
          postalCode: null,
          latitude: null,
          longitude: null,
          notes: null
        },
        citations: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    expect(deriveProfileDisplayValuesFromLifeEvents(lifeEvents).birthCountry).toBe("Germany");
  });
});
