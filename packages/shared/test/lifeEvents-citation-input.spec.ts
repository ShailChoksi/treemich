import { describe, expect, it } from "vitest";
import { createLifeEventBodySchema, lifeEventCitationInputSchema } from "../src/lifeEvents.js";

describe("lifeEventCitationInputSchema", () => {
  it("accepts an existing source id only", () => {
    expect(lifeEventCitationInputSchema.parse({ sourceId: "src_abc" })).toEqual({ sourceId: "src_abc" });
  });

  it("accepts inline fields without sourceId", () => {
    expect(
      lifeEventCitationInputSchema.parse({
        sourceId: null,
        title: "Will",
        repository: null,
        url: null,
        page: "3",
        notes: null,
        citedAt: null
      })
    ).toMatchObject({ title: "Will", page: "3" });
  });

  it("rejects whitespace-only sourceId without other fields", () => {
    expect(() =>
      lifeEventCitationInputSchema.parse({
        sourceId: "   ",
        title: null,
        repository: null,
        url: null,
        page: null,
        notes: null,
        citedAt: null
      })
    ).toThrow(/Each citation needs sourceId/);
  });

  it("rejects empty citation payload", () => {
    expect(() =>
      lifeEventCitationInputSchema.parse({
        sourceId: null,
        title: null,
        repository: null,
        url: null,
        page: null,
        notes: null,
        citedAt: null
      })
    ).toThrow(/Each citation needs sourceId/);
  });
});

describe("createLifeEventBodySchema citations", () => {
  it("parses valid body with citations", () => {
    const body = createLifeEventBodySchema.parse({
      eventType: "BIRTH",
      year: 1900,
      citations: [
        { sourceId: "s1", title: null, repository: null, url: null, page: null, notes: null, citedAt: null }
      ]
    });
    expect(body.citations).toHaveLength(1);
  });

  it("rejects placeId and place together", () => {
    expect(() =>
      createLifeEventBodySchema.parse({
        eventType: "BIRTH",
        placeId: "p1",
        place: { name: "Town" }
      })
    ).toThrow(/only one of placeId or place/);
  });
});
