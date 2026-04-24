import { DateQualifier, LifeEventType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { lifeEventToJson, type LifeEventWithRelations } from "./service.js";

const baseRow = (): LifeEventWithRelations =>
  ({
    id: "le-1",
    userId: "user-1",
    eventType: LifeEventType.RESIDENCE,
    dateQualifier: DateQualifier.EXACT,
    year: 1900,
    month: null,
    day: null,
    endYear: null,
    endMonth: null,
    endDay: null,
    notes: null,
    personProfileId: null,
    relationshipId: null,
    familyId: null,
    placeId: null,
    place: null,
    citations: [],
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    updatedAt: new Date("2020-01-02T00:00:00.000Z")
  }) as LifeEventWithRelations;

describe("lifeEventToJson", () => {
  it("includes familyId when set", () => {
    const json = lifeEventToJson({
      ...baseRow(),
      familyId: "fam-abc"
    } as LifeEventWithRelations);
    expect(json.familyId).toBe("fam-abc");
  });

  it("emits null familyId when absent on row", () => {
    const json = lifeEventToJson(baseRow());
    expect(json.familyId).toBeNull();
  });
});
