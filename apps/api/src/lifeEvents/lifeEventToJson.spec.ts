import { describe, expect, it } from "vitest";
import { lifeEventToJson, type LifeEventWithRelations } from "./service.js";

describe("lifeEventToJson", () => {
  const ts = new Date("2026-01-10T00:00:00.000Z");

  it("maps citations with nested source and repository for API clients", () => {
    const event = {
      id: "le-1",
      userId: "u1",
      eventType: "BIRTH",
      customLabel: null,
      dateQualifier: "EXACT",
      year: 1920,
      month: null,
      day: null,
      endYear: null,
      endMonth: null,
      endDay: null,
      personProfileId: "pp1",
      relationshipId: null,
      placeId: null,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
      place: null,
      citations: [
        {
          id: "c1",
          userId: "u1",
          lifeEventId: "le-1",
          sourceId: "s1",
          page: "12",
          notes: "tab A",
          citedAt: "1920-04-01",
          source: {
            id: "s1",
            userId: "u1",
            repositoryId: "r1",
            title: "1920 Census",
            author: null,
            publication: null,
            url: "https://example/c",
            notes: null,
            createdAt: ts,
            updatedAt: ts,
            repository: {
              id: "r1",
              userId: "u1",
              name: "NARA",
              addressLine1: null,
              url: null,
              notes: null,
              createdAt: ts,
              updatedAt: ts
            }
          }
        }
      ]
    } as unknown as LifeEventWithRelations;

    const json = lifeEventToJson(event);

    expect(json.citations).toHaveLength(1);
    expect(json.citations[0]).toEqual({
      id: "c1",
      sourceId: "s1",
      title: "1920 Census",
      repository: "NARA",
      url: "https://example/c",
      page: "12",
      notes: "tab A",
      citedAt: "1920-04-01",
      source: {
        id: "s1",
        title: "1920 Census",
        repositoryId: "r1",
        repository: { id: "r1", name: "NARA" }
      }
    });
  });

  it("uses null repository label when source has no repository row", () => {
    const event = {
      id: "le-2",
      userId: "u1",
      eventType: "DEATH",
      customLabel: null,
      dateQualifier: "EXACT",
      year: 2000,
      month: null,
      day: null,
      endYear: null,
      endMonth: null,
      endDay: null,
      personProfileId: "pp1",
      relationshipId: null,
      placeId: null,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
      place: null,
      citations: [
        {
          id: "c2",
          userId: "u1",
          lifeEventId: "le-2",
          sourceId: "s2",
          page: null,
          notes: null,
          citedAt: null,
          source: {
            id: "s2",
            userId: "u1",
            repositoryId: null,
            title: "Obituary",
            author: null,
            publication: null,
            url: null,
            notes: null,
            createdAt: ts,
            updatedAt: ts,
            repository: null
          }
        }
      ]
    } as unknown as LifeEventWithRelations;

    const json = lifeEventToJson(event);
    expect(json.citations[0]?.repository).toBeNull();
    expect(json.citations[0]?.source.repository).toBeNull();
  });

  it("includes customLabel for CUSTOM events", () => {
    const event = {
      id: "le-3",
      userId: "u1",
      eventType: "CUSTOM",
      customLabel: "Discharge",
      dateQualifier: "EXACT",
      year: 1945,
      month: 5,
      day: 1,
      endYear: null,
      endMonth: null,
      endDay: null,
      personProfileId: "pp1",
      relationshipId: null,
      placeId: null,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
      place: null,
      citations: []
    } as unknown as LifeEventWithRelations;

    const json = lifeEventToJson(event);
    expect(json.customLabel).toBe("Discharge");
  });
});
