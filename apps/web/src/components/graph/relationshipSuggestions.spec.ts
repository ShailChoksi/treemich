import { describe, expect, it } from "vitest";
import type { ImmichPerson, RelationshipRecord } from "../../lib/api";
import { computeSuggestions, getSuggestionRelationshipLabel } from "./relationshipSuggestions";

const person = (id: string, name: string): ImmichPerson => ({
  id,
  name,
  hasRelationship: false
});

const people: ImmichPerson[] = [
  person("alex", "Alex"),
  person("blair", "Blair"),
  person("casey", "Casey"),
  person("drew", "Drew"),
  person("elliot", "Elliot"),
  person("fran", "Fran"),
  person("gray", "Gray"),
  person("harper", "Harper"),
  person("indigo", "Indigo"),
  person("jules", "Jules"),
  person("kai", "Kai"),
  person("lane", "Lane")
];

const summary = (
  selectedPersonId: string,
  relationships: RelationshipRecord[],
  dismissedKeys: string[] = []
) =>
  computeSuggestions(selectedPersonId, people, relationships, dismissedKeys).map((suggestion) => ({
    key: suggestion.key,
    personId: suggestion.personId,
    suggestedType: suggestion.suggestedType,
    reason: suggestion.reason
  }));

describe("getSuggestionRelationshipLabel", () => {
  it("returns short labels used in suggestion UI (e.g. Add as … tooltips)", () => {
    expect(getSuggestionRelationshipLabel("SPOUSE_OF")).toBe("Spouse");
    expect(getSuggestionRelationshipLabel("PARENT_OF")).toBe("Child");
    expect(getSuggestionRelationshipLabel("CHILD_OF")).toBe("Parent");
    expect(getSuggestionRelationshipLabel("SIBLING_OF")).toBe("Sibling");
    expect(getSuggestionRelationshipLabel("FRIEND_OF")).toBe("Friend");
    expect(getSuggestionRelationshipLabel("PET_OF")).toBe("Pet");
  });
});

describe("computeSuggestions", () => {
  it("suggests a missing sibling when two people share a parent", () => {
    const suggestions = summary("alex", [
      { fromPersonId: "casey", toPersonId: "alex", type: "PARENT_OF" },
      { fromPersonId: "casey", toPersonId: "blair", type: "PARENT_OF" }
    ]);

    expect(suggestions).toEqual([
      {
        key: "sibling:alex:blair",
        personId: "blair",
        suggestedType: "SIBLING_OF",
        reason: "Both are children of Casey."
      }
    ]);
  });

  it("suggests a missing parent connection from a sibling's parent", () => {
    const suggestions = summary("alex", [
      { fromPersonId: "alex", toPersonId: "blair", type: "SIBLING_OF" },
      { fromPersonId: "casey", toPersonId: "blair", type: "PARENT_OF" }
    ]);

    expect(suggestions).toEqual([
      {
        key: "parent:casey:alex",
        personId: "casey",
        suggestedType: "CHILD_OF",
        reason: "Casey is already a parent of sibling Blair."
      }
    ]);
  });

  it("suggests a missing spouse when two people share a child", () => {
    const suggestions = summary("alex", [
      { fromPersonId: "alex", toPersonId: "casey", type: "PARENT_OF" },
      { fromPersonId: "blair", toPersonId: "casey", type: "PARENT_OF" }
    ]);

    expect(suggestions).toEqual([
      {
        key: "spouse:alex:blair",
        personId: "blair",
        suggestedType: "SPOUSE_OF",
        reason: "Both are parents of Casey."
      }
    ]);
  });

  it("suggests a spouse's child as a missing child relationship", () => {
    const suggestions = summary("alex", [
      { fromPersonId: "alex", toPersonId: "blair", type: "SPOUSE_OF" },
      { fromPersonId: "blair", toPersonId: "casey", type: "PARENT_OF" }
    ]);

    expect(suggestions).toEqual([
      {
        key: "parent:alex:casey",
        personId: "casey",
        suggestedType: "PARENT_OF",
        reason: "Casey is already connected as a child of spouse Blair."
      }
    ]);
  });

  it("deduplicates identical suggestions produced by multiple graph paths", () => {
    const suggestions = summary("alex", [
      { fromPersonId: "casey", toPersonId: "alex", type: "PARENT_OF" },
      { fromPersonId: "drew", toPersonId: "alex", type: "PARENT_OF" },
      { fromPersonId: "casey", toPersonId: "blair", type: "PARENT_OF" },
      { fromPersonId: "drew", toPersonId: "blair", type: "PARENT_OF" }
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.key).toBe("sibling:alex:blair");
    expect(suggestions[0]?.reason).toBe("Both are children of Casey and Drew.");
  });

  it("uses the same symmetric suggestion key regardless of which person is selected", () => {
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "casey", toPersonId: "alex", type: "PARENT_OF" },
      { fromPersonId: "casey", toPersonId: "blair", type: "PARENT_OF" }
    ];

    const alexSuggestion = computeSuggestions("alex", people, relationships, []);
    const blairSuggestion = computeSuggestions("blair", people, relationships, []);

    expect(alexSuggestion[0]?.key).toBe("sibling:alex:blair");
    expect(blairSuggestion[0]?.key).toBe("sibling:alex:blair");
  });

  it("ignores malformed self-referential relationships", () => {
    expect(
      summary("alex", [
        { fromPersonId: "alex", toPersonId: "alex", type: "SIBLING_OF" },
        { fromPersonId: "alex", toPersonId: "alex", type: "SPOUSE_OF" },
        { fromPersonId: "alex", toPersonId: "alex", type: "PARENT_OF" }
      ])
    ).toEqual([]);
  });

  it("does not suggest a relationship when the same semantic connection already exists", () => {
    expect(
      summary("alex", [
        { fromPersonId: "casey", toPersonId: "alex", type: "PARENT_OF" },
        { fromPersonId: "casey", toPersonId: "blair", type: "PARENT_OF" },
        { fromPersonId: "alex", toPersonId: "blair", type: "SIBLING_OF" }
      ])
    ).toEqual([]);

    expect(
      summary("alex", [
        { fromPersonId: "alex", toPersonId: "casey", type: "PARENT_OF" },
        { fromPersonId: "blair", toPersonId: "casey", type: "PARENT_OF" },
        { fromPersonId: "alex", toPersonId: "blair", type: "SPOUSE_OF" }
      ])
    ).toEqual([]);
  });

  it("still suggests a missing relationship when only a different relationship type exists", () => {
    const suggestions = summary("alex", [
      { fromPersonId: "casey", toPersonId: "alex", type: "PARENT_OF" },
      { fromPersonId: "casey", toPersonId: "blair", type: "PARENT_OF" },
      { fromPersonId: "alex", toPersonId: "blair", type: "FRIEND_OF" }
    ]);

    expect(suggestions).toEqual([
      {
        key: "sibling:alex:blair",
        personId: "blair",
        suggestedType: "SIBLING_OF",
        reason: "Both are children of Casey."
      }
    ]);
  });

  it("filters dismissed suggestions and keeps them dismissed after the graph is rebuilt", () => {
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "casey", toPersonId: "alex", type: "PARENT_OF" },
      { fromPersonId: "casey", toPersonId: "blair", type: "PARENT_OF" }
    ];
    const dismissedKeys = ["sibling:alex:blair"];

    expect(summary("alex", relationships, dismissedKeys)).toEqual([]);
    expect(
      summary(
        "alex",
        [
          { fromPersonId: "casey", toPersonId: "alex", type: "PARENT_OF" },
          { fromPersonId: "casey", toPersonId: "blair", type: "PARENT_OF" }
        ],
        dismissedKeys
      )
    ).toEqual([]);
  });

  it("returns an empty list for an empty graph", () => {
    expect(summary("alex", [])).toEqual([]);
  });

  it("covers all sibling pairs in a large fan-out family", () => {
    const familyPeople = [
      person("parent", "Parent"),
      ...Array.from({ length: 10 }, (_, index) => person(`child-${index + 1}`, `Child ${index + 1}`))
    ];
    const relationships: RelationshipRecord[] = familyPeople
      .filter((entry) => entry.id !== "parent")
      .map((entry) => ({
        fromPersonId: "parent",
        toPersonId: entry.id,
        type: "PARENT_OF" as const
      }));

    const allKeys = new Set<string>();
    for (const familyMember of familyPeople) {
      if (familyMember.id === "parent") {
        continue;
      }
      for (const suggestion of computeSuggestions(familyMember.id, familyPeople, relationships, [])) {
        allKeys.add(suggestion.key);
      }
    }

    expect(allKeys.size).toBe(45);
  });

  it("suggests a spouse even when there is only one shared child signal", () => {
    const suggestions = summary("alex", [
      { fromPersonId: "alex", toPersonId: "casey", type: "PARENT_OF" },
      { fromPersonId: "blair", toPersonId: "casey", type: "PARENT_OF" }
    ]);

    expect(suggestions[0]?.suggestedType).toBe("SPOUSE_OF");
  });

  it("includes the spouse name in step-parent suggestion reasons", () => {
    const suggestions = summary("alex", [
      { fromPersonId: "alex", toPersonId: "blair", type: "SPOUSE_OF" },
      { fromPersonId: "blair", toPersonId: "casey", type: "PARENT_OF" }
    ]);

    expect(suggestions[0]?.reason).toContain("spouse Blair");
  });

  it("returns all suggestions and orders them deterministically", () => {
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "casey", toPersonId: "alex", type: "PARENT_OF" },
      { fromPersonId: "casey", toPersonId: "blair", type: "PARENT_OF" },
      { fromPersonId: "casey", toPersonId: "kai", type: "PARENT_OF" },
      { fromPersonId: "alex", toPersonId: "drew", type: "PARENT_OF" },
      { fromPersonId: "elliot", toPersonId: "drew", type: "PARENT_OF" },
      { fromPersonId: "alex", toPersonId: "fran", type: "SPOUSE_OF" },
      { fromPersonId: "fran", toPersonId: "gray", type: "PARENT_OF" },
      { fromPersonId: "alex", toPersonId: "harper", type: "SIBLING_OF" },
      { fromPersonId: "indigo", toPersonId: "harper", type: "PARENT_OF" },
      { fromPersonId: "lane", toPersonId: "harper", type: "PARENT_OF" }
    ];

    const forward = computeSuggestions("alex", people, relationships, []);
    const reversed = computeSuggestions("alex", [...people].reverse(), [...relationships].reverse(), []);

    expect(forward).toHaveLength(6);
    expect(forward).toEqual(reversed);
    expect(forward.map((entry) => entry.personId)).toEqual([
      "blair",
      "elliot",
      "gray",
      "indigo",
      "kai",
      "lane"
    ]);
  });
});
