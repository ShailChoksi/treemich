import { describe, expect, it } from "vitest";
import {
  buildGraphLayoutRevision,
  cooccurrenceJobStatusSchema,
  cooccurrencePreferencesSchema,
  defaultCooccurrencePreferences,
  filterGraphLayoutTopologyRelationships,
  graphFilterVisibilitySchema,
  graphLayoutModeSchema,
  graphLayoutRequestSchema,
  graphLayoutResponseSchema,
  graphLineRoutingStyleSchema,
  inverseRelationshipType,
  relationshipTypeSchema,
  userPreferencesSchema
} from "../src/index.js";

describe("inverseRelationshipType", () => {
  it("swaps parent and child directions", () => {
    expect(inverseRelationshipType("PARENT_OF")).toBe("CHILD_OF");
    expect(inverseRelationshipType("CHILD_OF")).toBe("PARENT_OF");
  });

  it("leaves other relationship kinds unchanged", () => {
    expect(inverseRelationshipType("SPOUSE_OF")).toBe("SPOUSE_OF");
    expect(inverseRelationshipType("PET_OF")).toBe("PET_OF");
  });
});

describe("filterGraphLayoutTopologyRelationships", () => {
  it("keeps only parent, child, and spouse edges", () => {
    const rows = [
      { type: "PARENT_OF" as const, id: "1" },
      { type: "SIBLING_OF" as const, id: "2" },
      { type: "SPOUSE_OF" as const, id: "3" },
      { type: "FRIEND_OF" as const, id: "4" }
    ];
    const filtered = filterGraphLayoutTopologyRelationships(rows);
    expect(filtered.map((r) => r.id).sort()).toEqual(["1", "3"]);
  });
});

describe("shared enums and preference schemas", () => {
  it("parses relationship and layout mode enums", () => {
    expect(relationshipTypeSchema.parse("CHILD_OF")).toBe("CHILD_OF");
    expect(() => relationshipTypeSchema.parse("INVALID")).toThrow();
    expect(graphLayoutModeSchema.parse("photo")).toBe("photo");
    expect(graphLineRoutingStyleSchema.parse("direct")).toBe("direct");
    expect(cooccurrenceJobStatusSchema.parse("COMPLETED")).toBe("COMPLETED");
  });

  it("parses graph filter visibility and co-occurrence preferences", () => {
    expect(
      graphFilterVisibilitySchema.parse({
        parentChild: true,
        spouse: true,
        sibling: false,
        friends: false,
        pets: true
      })
    ).toMatchObject({ pets: true });

    expect(cooccurrencePreferencesSchema.parse({ refreshEnabled: false, refreshIntervalDays: 14 })).toEqual({
      refreshEnabled: false,
      refreshIntervalDays: 14
    });
    expect(() =>
      cooccurrencePreferencesSchema.parse({ refreshEnabled: true, refreshIntervalDays: 0 })
    ).toThrow();
  });

  it("parses nested user preferences", () => {
    const prefs = userPreferencesSchema.parse({
      graphFilterVisibility: {
        parentChild: true,
        spouse: true,
        sibling: true,
        friends: false,
        pets: false
      },
      searchIncludeAlternateNames: true
    });
    expect(prefs.searchIncludeAlternateNames).toBe(true);
  });

  it("exposes default co-occurrence preferences", () => {
    expect(defaultCooccurrencePreferences).toEqual({
      refreshEnabled: true,
      refreshIntervalDays: 7
    });
  });
});

describe("graphLayoutRequestSchema and buildGraphLayoutRevision", () => {
  const minimalRequest = () =>
    graphLayoutRequestSchema.parse({
      people: [
        { id: "b", name: "Bob" },
        { id: "a", name: "Ann" }
      ],
      relationships: [
        { fromPersonId: "a", toPersonId: "b", type: "PARENT_OF" },
        { fromPersonId: "a", toPersonId: "c", type: "FRIEND_OF" }
      ]
    });

  it("defaults viewMode to family", () => {
    const req = minimalRequest();
    expect(req.viewMode).toBe("family");
  });

  it("produces a stable revision independent of input order", () => {
    const req1 = graphLayoutRequestSchema.parse({
      people: [
        { id: "p2", name: "Two" },
        { id: "p1", name: "One" }
      ],
      relationships: [
        { fromPersonId: "p1", toPersonId: "p2", type: "CHILD_OF" },
        { fromPersonId: "p2", toPersonId: "p1", type: "PARENT_OF" }
      ],
      viewMode: "family"
    });
    const req2 = graphLayoutRequestSchema.parse({
      people: [
        { id: "p1", name: "One" },
        { id: "p2", name: "Two" }
      ],
      relationships: [
        { fromPersonId: "p2", toPersonId: "p1", type: "PARENT_OF" },
        { fromPersonId: "p1", toPersonId: "p2", type: "CHILD_OF" }
      ],
      viewMode: "family"
    });
    expect(buildGraphLayoutRevision(req1)).toBe(buildGraphLayoutRevision(req2));
  });

  it("changes revision when topology filter would drop different edges", () => {
    const withSpouse = graphLayoutRequestSchema.parse({
      people: [{ id: "a", name: "A" }],
      relationships: [{ fromPersonId: "a", toPersonId: "b", type: "SPOUSE_OF" }],
      viewMode: "family"
    });
    const withFriend = graphLayoutRequestSchema.parse({
      people: [{ id: "a", name: "A" }],
      relationships: [{ fromPersonId: "a", toPersonId: "b", type: "FRIEND_OF" }],
      viewMode: "family"
    });
    expect(buildGraphLayoutRevision(withSpouse)).not.toBe(buildGraphLayoutRevision(withFriend));
  });
});

describe("graphLayoutResponseSchema", () => {
  it("requires tuple positions of length three", () => {
    const parsed = graphLayoutResponseSchema.parse({
      layoutRevision: "rev-1",
      algorithmVersion: "1.0.0",
      positionsByPersonId: { p1: [0, 1, 2] }
    });
    expect(parsed.positionsByPersonId.p1).toEqual([0, 1, 2]);
    expect(() =>
      graphLayoutResponseSchema.parse({
        layoutRevision: "r",
        algorithmVersion: "1",
        positionsByPersonId: { p1: [0, 1] }
      })
    ).toThrow();
  });
});
