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
  defaultTreeLayoutPreferences,
  positionGenerationTreePeople,
  resolveTreeLayoutPreferences,
  treeLayoutPreferencesSchema,
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

  it("parses onboardingTutorial when both dismissed fields are present", () => {
    const prefs = userPreferencesSchema.parse({
      onboardingTutorial: {
        dismissedVersion: "v1",
        dismissedAt: "2025-05-01T12:00:00.000Z"
      }
    });
    expect(prefs.onboardingTutorial).toEqual({
      dismissedVersion: "v1",
      dismissedAt: "2025-05-01T12:00:00.000Z"
    });
  });

  it("rejects onboardingTutorial when dismissedAt is missing", () => {
    expect(() =>
      userPreferencesSchema.parse({
        onboardingTutorial: { dismissedVersion: "v1" }
      })
    ).toThrow();
  });

  it("rejects onboardingTutorial when dismissedVersion is missing", () => {
    expect(() =>
      userPreferencesSchema.parse({
        onboardingTutorial: { dismissedAt: "2025-05-01T12:00:00.000Z" }
      })
    ).toThrow();
  });

  it("rejects onboardingTutorial when dismissedAt is not a valid datetime string", () => {
    expect(() =>
      userPreferencesSchema.parse({
        onboardingTutorial: { dismissedVersion: "v1", dismissedAt: "not-a-date" }
      })
    ).toThrow();
  });

  it("exposes default co-occurrence preferences", () => {
    expect(defaultCooccurrencePreferences).toEqual({
      refreshEnabled: true,
      refreshIntervalDays: 7
    });
  });

  it("resolves tree layout preferences with defaults and bounded values", () => {
    expect(resolveTreeLayoutPreferences(undefined)).toEqual(defaultTreeLayoutPreferences);
    expect(
      treeLayoutPreferencesSchema.parse({
        horizontalSpacing: 0.25,
        verticalSpacing: 2,
        spouseBranchZDistance: 1.25,
        spouseBranchSensitivity: 0.75
      })
    ).toEqual({
      horizontalSpacing: 0.25,
      verticalSpacing: 2,
      spouseBranchZDistance: 1.25,
      spouseBranchSensitivity: 0.75
    });
    expect(
      userPreferencesSchema.parse({
        treeLayoutPreferences: {
          horizontalSpacing: 1.1
        }
      }).treeLayoutPreferences
    ).toEqual({
      horizontalSpacing: 1.1
    });
    expect(() => treeLayoutPreferencesSchema.parse({ horizontalSpacing: 0.2 })).toThrow();
    expect(() => treeLayoutPreferencesSchema.parse({ spouseBranchSensitivity: 2.1 })).toThrow();
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

  it("changes revision when tree layout preferences change", () => {
    const base = graphLayoutRequestSchema.parse({
      people: [
        { id: "a", name: "A" },
        { id: "b", name: "B" }
      ],
      relationships: [{ fromPersonId: "a", toPersonId: "b", type: "PARENT_OF" }],
      viewMode: "family",
      familyViewStyle: "generationTree"
    });
    const baseRevision = buildGraphLayoutRevision(base);
    const preferenceChanges = [
      { horizontalSpacing: 1.1 },
      { verticalSpacing: 1.1 },
      { spouseBranchZDistance: 1.1 },
      { spouseBranchSensitivity: 1.1 }
    ];

    for (const treeLayoutPreferences of preferenceChanges) {
      expect(
        buildGraphLayoutRevision(
          graphLayoutRequestSchema.parse({
            ...base,
            treeLayoutPreferences
          })
        )
      ).not.toBe(baseRevision);
    }
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

describe("positionGenerationTreePeople", () => {
  it("positions family relationships through the shared generation-tree layout", () => {
    const positioned = positionGenerationTreePeople(
      [
        { id: "parent", name: "Parent Example" },
        { id: "child", name: "Child Example" }
      ],
      [{ fromPersonId: "parent", toPersonId: "child", type: "PARENT_OF" }]
    );
    const parent = positioned.find((entry) => entry.person.id === "parent")?.position;
    const child = positioned.find((entry) => entry.person.id === "child")?.position;

    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(parent?.[1]).toBeGreaterThan(child?.[1] ?? Number.POSITIVE_INFINITY);
  });

  it("uses horizontal spacing to scale the family tree X spread", () => {
    const people = [
      { id: "parent-a", name: "Parent A" },
      { id: "parent-b", name: "Parent B" },
      { id: "child-a", name: "Child A" },
      { id: "child-b", name: "Child B" },
      { id: "child-c", name: "Child C" }
    ];
    const relationships = [
      { fromPersonId: "parent-a", toPersonId: "parent-b", type: "SPOUSE_OF" as const },
      { fromPersonId: "parent-a", toPersonId: "child-a", type: "PARENT_OF" as const },
      { fromPersonId: "parent-b", toPersonId: "child-a", type: "PARENT_OF" as const },
      { fromPersonId: "parent-a", toPersonId: "child-b", type: "PARENT_OF" as const },
      { fromPersonId: "parent-b", toPersonId: "child-b", type: "PARENT_OF" as const },
      { fromPersonId: "parent-a", toPersonId: "child-c", type: "PARENT_OF" as const },
      { fromPersonId: "parent-b", toPersonId: "child-c", type: "PARENT_OF" as const }
    ];
    const xSpread = (horizontalSpacing: number) => {
      const xs = positionGenerationTreePeople(people, relationships, {
        treeLayoutPreferences: { horizontalSpacing }
      }).map((entry) => entry.position[0]);
      return Math.max(...xs) - Math.min(...xs);
    };

    expect(xSpread(2)).toBeGreaterThan(xSpread(0.5) * 1.5);
  });

  it("uses vertical spacing to scale generation Y gaps", () => {
    const people = [
      { id: "grandparent", name: "Grandparent Example" },
      { id: "parent", name: "Parent Example" },
      { id: "child", name: "Child Example" }
    ];
    const relationships = [
      { fromPersonId: "grandparent", toPersonId: "parent", type: "PARENT_OF" as const },
      { fromPersonId: "parent", toPersonId: "child", type: "PARENT_OF" as const }
    ];
    const yGap = (verticalSpacing: number) => {
      const byId = new Map(
        positionGenerationTreePeople(people, relationships, {
          treeLayoutPreferences: { verticalSpacing }
        }).map((entry) => [entry.person.id, entry.position])
      );
      return Math.abs((byId.get("grandparent")?.[1] ?? 0) - (byId.get("child")?.[1] ?? 0));
    };

    expect(yGap(2)).toBeGreaterThan(yGap(0.5) * 2);
  });

  it("uses spouse branch Z distance to scale rotated spouse-side depth", () => {
    const people = [
      { id: "A", name: "A Main" },
      { id: "B", name: "B Spouse" },
      { id: "pa1", name: "Parent A1" },
      { id: "pa2", name: "Parent A2" },
      { id: "sibA", name: "Sibling A" },
      { id: "gpa1", name: "Grand A1" },
      { id: "gpa2", name: "Grand A2" },
      { id: "gpa3", name: "Grand A3" },
      { id: "gpa4", name: "Grand A4" },
      { id: "pb1", name: "Parent B1" }
    ];
    const relationships = [
      { fromPersonId: "A", toPersonId: "B", type: "SPOUSE_OF" as const },
      { fromPersonId: "pa1", toPersonId: "A", type: "PARENT_OF" as const },
      { fromPersonId: "pa2", toPersonId: "A", type: "PARENT_OF" as const },
      { fromPersonId: "pa1", toPersonId: "sibA", type: "PARENT_OF" as const },
      { fromPersonId: "pa2", toPersonId: "sibA", type: "PARENT_OF" as const },
      { fromPersonId: "gpa1", toPersonId: "pa1", type: "PARENT_OF" as const },
      { fromPersonId: "gpa2", toPersonId: "pa1", type: "PARENT_OF" as const },
      { fromPersonId: "gpa3", toPersonId: "pa2", type: "PARENT_OF" as const },
      { fromPersonId: "gpa4", toPersonId: "pa2", type: "PARENT_OF" as const },
      { fromPersonId: "pb1", toPersonId: "B", type: "PARENT_OF" as const }
    ];
    const zOffset = (spouseBranchZDistance: number) => {
      const byId = new Map(
        positionGenerationTreePeople(people, relationships, {
          treeLayoutPreferences: { spouseBranchZDistance }
        }).map((entry) => [entry.person.id, entry.position])
      );
      const mainPlaneZ = ((byId.get("pa1")?.[2] ?? 0) + (byId.get("pa2")?.[2] ?? 0)) / 2;
      return Math.abs((byId.get("pb1")?.[2] ?? 0) - mainPlaneZ);
    };

    expect(zOffset(2)).toBeGreaterThan(zOffset(0.5) * 1.5);
  });

  it("uses spouse branch sensitivity to rotate more borderline spouse branches", () => {
    const people = [
      { id: "A", name: "A Main" },
      { id: "B", name: "B Spouse" },
      { id: "pa1", name: "Parent A1" },
      { id: "gpa1", name: "Grand A1" },
      { id: "sibA", name: "Sibling A" },
      { id: "pb1", name: "Parent B1" },
      { id: "sibB", name: "Sibling B" }
    ];
    const relationships = [
      { fromPersonId: "A", toPersonId: "B", type: "SPOUSE_OF" as const },
      { fromPersonId: "pa1", toPersonId: "A", type: "PARENT_OF" as const },
      { fromPersonId: "pa1", toPersonId: "sibA", type: "PARENT_OF" as const },
      { fromPersonId: "gpa1", toPersonId: "pa1", type: "PARENT_OF" as const },
      { fromPersonId: "pb1", toPersonId: "B", type: "PARENT_OF" as const },
      { fromPersonId: "pb1", toPersonId: "sibB", type: "PARENT_OF" as const }
    ];
    const zOffset = (spouseBranchSensitivity: number) => {
      const byId = new Map(
        positionGenerationTreePeople(people, relationships, {
          treeLayoutPreferences: { spouseBranchSensitivity }
        }).map((entry) => [entry.person.id, entry.position])
      );
      return Math.abs((byId.get("pb1")?.[2] ?? 0) - (byId.get("pa1")?.[2] ?? 0));
    };

    expect(zOffset(2)).toBeGreaterThan(zOffset(1) + 1);
  });
});
