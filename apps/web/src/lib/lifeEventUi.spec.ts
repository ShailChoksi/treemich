import { describe, expect, it } from "vitest";
import type { LifeEventRecord, RelationshipRecord } from "./api";
import { deriveSpouseDatesFromRelationshipEvents } from "./lifeEventUi";

const legacyOnly: Pick<RelationshipRecord, "marriageAnniversaryDate" | "divorceDate"> = {
  marriageAnniversaryDate: "2010-06-15",
  divorceDate: "2020-01-20"
};

const marriageEvent = (y: number, m: number, d: number): LifeEventRecord => ({
  id: "ev-m",
  eventType: "MARRIAGE",
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
  it("uses legacy columns when no life events exist", () => {
    expect(deriveSpouseDatesFromRelationshipEvents([], legacyOnly)).toEqual({
      marriage: "2010-06-15",
      divorce: "2020-01-20"
    });
  });

  it("prefers MARRIAGE and DIVORCE events over legacy fields", () => {
    expect(
      deriveSpouseDatesFromRelationshipEvents(
        [marriageEvent(2011, 7, 8), divorceEvent(2021, 9, 10)],
        legacyOnly
      )
    ).toEqual({
      marriage: "2011-07-08",
      divorce: "2021-09-10"
    });
  });

  it("uses legacy for marriage when only divorce event exists", () => {
    expect(deriveSpouseDatesFromRelationshipEvents([divorceEvent(2021, 9, 10)], legacyOnly)).toEqual({
      marriage: "2010-06-15",
      divorce: "2021-09-10"
    });
  });
});
