import { describe, expect, it } from "vitest";
import type { ImmichPerson, RelationshipRecord } from "../../lib/api";
import {
  buildSiblingIndex,
  buildSpouseIndex,
  computeExtendedFamily,
  computeInLawFamily
} from "./extendedFamily";

const person = (id: string, name: string): ImmichPerson => ({
  id,
  name,
  hasRelationship: false
});

const rel = (from: string, to: string, type: RelationshipRecord["type"]): RelationshipRecord => ({
  fromPersonId: from,
  toPersonId: to,
  type
});

describe("buildSiblingIndex", () => {
  it("indexes bidirectional sibling edges", () => {
    const relationships: RelationshipRecord[] = [rel("a", "b", "SIBLING_OF")];
    const index = buildSiblingIndex(relationships);
    expect(index.get("a")?.has("b")).toBe(true);
    expect(index.get("b")?.has("a")).toBe(true);
  });

  it("ignores self-referencing sibling edges", () => {
    const relationships: RelationshipRecord[] = [rel("a", "a", "SIBLING_OF")];
    const index = buildSiblingIndex(relationships);
    expect(index.size).toBe(0);
  });

  it("ignores non-sibling relationship types", () => {
    const relationships: RelationshipRecord[] = [rel("a", "b", "PARENT_OF"), rel("c", "d", "FRIEND_OF")];
    const index = buildSiblingIndex(relationships);
    expect(index.size).toBe(0);
  });
});

describe("buildSpouseIndex", () => {
  it("indexes bidirectional spouse edges", () => {
    const relationships: RelationshipRecord[] = [rel("a", "b", "SPOUSE_OF")];
    const index = buildSpouseIndex(relationships);
    expect(index.get("a")?.has("b")).toBe(true);
    expect(index.get("b")?.has("a")).toBe(true);
  });

  it("ignores self-referencing spouse edges", () => {
    const relationships: RelationshipRecord[] = [rel("a", "a", "SPOUSE_OF")];
    const index = buildSpouseIndex(relationships);
    expect(index.size).toBe(0);
  });
});

describe("computeExtendedFamily", () => {
  const allPeople = [
    person("me", "Me"),
    person("mom", "Mom"),
    person("dad", "Dad"),
    person("gma", "Grandma"),
    person("gpa", "Grandpa"),
    person("uncle", "Uncle"),
    person("aunt", "Aunt"),
    person("cousin1", "Cousin1"),
    person("cousin2", "Cousin2"),
    person("sibling", "Sibling"),
    person("nephew", "Nephew"),
    person("child", "Child"),
    person("grandchild", "Grandchild"),
    person("ggpa", "GreatGrandpa"),
    person("uncle2_parent", "Uncle2Parent"),
    person("uncle2_sibling", "Uncle2Sibling"),
    person("cousin2nd", "SecondCousin"),
    person("ggppa", "GreatGreatGrandpa"),
    person("uncle3_parent", "Uncle3Parent"),
    person("uncle3_gparent", "Uncle3GParent"),
    person("uncle3_sibling", "Uncle3Sibling"),
    person("cousin3rd", "ThirdCousin")
  ];

  const baseRelationships: RelationshipRecord[] = [
    rel("mom", "me", "PARENT_OF"),
    rel("dad", "me", "PARENT_OF"),
    rel("gma", "mom", "PARENT_OF"),
    rel("gpa", "mom", "PARENT_OF"),
    rel("gma", "uncle", "PARENT_OF"),
    rel("mom", "uncle", "SIBLING_OF"),
    rel("uncle", "cousin1", "PARENT_OF"),
    rel("aunt", "cousin1", "PARENT_OF"),
    rel("uncle", "cousin2", "PARENT_OF"),
    rel("me", "sibling", "SIBLING_OF"),
    rel("sibling", "nephew", "PARENT_OF"),
    rel("me", "child", "PARENT_OF"),
    rel("child", "grandchild", "PARENT_OF")
  ];

  it("finds grandparents (2 hops up)", () => {
    const directIds = new Set(["mom", "dad"]);
    const result = computeExtendedFamily("me", allPeople, baseRelationships, directIds);
    const grandparents = result.filter((m) => m.label === "Grandparent");
    expect(grandparents.map((m) => m.personId).sort()).toEqual(["gma", "gpa"]);
  });

  it("finds grandchildren (2 hops down)", () => {
    const directIds = new Set(["child"]);
    const result = computeExtendedFamily("me", allPeople, baseRelationships, directIds);
    const grandchildren = result.filter((m) => m.label === "Grandchild");
    expect(grandchildren.map((m) => m.personId)).toEqual(["grandchild"]);
  });

  it("finds uncles/aunts (parent -> sibling)", () => {
    const directIds = new Set(["mom", "dad"]);
    const result = computeExtendedFamily("me", allPeople, baseRelationships, directIds);
    const unclesAunts = result.filter((m) => m.label === "Uncle/Aunt");
    expect(unclesAunts.map((m) => m.personId)).toEqual(["uncle"]);
  });

  it("finds nephews/nieces (sibling -> child)", () => {
    const directIds = new Set(["sibling"]);
    const result = computeExtendedFamily("me", allPeople, baseRelationships, directIds);
    const nephews = result.filter((m) => m.label === "Nephew/Niece");
    expect(nephews.map((m) => m.personId)).toEqual(["nephew"]);
  });

  it("finds 1st cousins (parent -> sibling -> child)", () => {
    const directIds = new Set(["mom", "dad"]);
    const result = computeExtendedFamily("me", allPeople, baseRelationships, directIds);
    const cousins = result.filter((m) => m.label === "1st Cousin");
    expect(cousins.map((m) => m.personId).sort()).toEqual(["cousin1", "cousin2"]);
  });

  it("finds 2nd cousins (5-hop traversal)", () => {
    const relationships: RelationshipRecord[] = [
      ...baseRelationships,
      rel("ggpa", "gma", "PARENT_OF"),
      rel("ggpa", "uncle2_parent", "PARENT_OF"),
      rel("gma", "uncle2_parent", "SIBLING_OF"),
      rel("uncle2_parent", "uncle2_sibling", "PARENT_OF"),
      rel("uncle2_sibling", "cousin2nd", "PARENT_OF")
    ];
    const directIds = new Set(["mom", "dad"]);
    const result = computeExtendedFamily("me", allPeople, relationships, directIds);
    const secondCousins = result.filter((m) => m.label === "2nd Cousin");
    expect(secondCousins.map((m) => m.personId)).toContain("cousin2nd");
  });

  it("finds 3rd cousins (7-hop traversal)", () => {
    const relationships: RelationshipRecord[] = [
      ...baseRelationships,
      rel("ggpa", "gma", "PARENT_OF"),
      rel("ggppa", "ggpa", "PARENT_OF"),
      rel("ggppa", "uncle3_gparent", "PARENT_OF"),
      rel("ggpa", "uncle3_gparent", "SIBLING_OF"),
      rel("uncle3_gparent", "uncle3_parent", "PARENT_OF"),
      rel("uncle3_parent", "uncle3_sibling", "PARENT_OF"),
      rel("uncle3_sibling", "cousin3rd", "PARENT_OF")
    ];
    const directIds = new Set(["mom", "dad"]);
    const result = computeExtendedFamily("me", allPeople, relationships, directIds);
    const thirdCousins = result.filter((m) => m.label === "3rd Cousin");
    expect(thirdCousins.map((m) => m.personId)).toContain("cousin3rd");
  });

  it("deduplicates against direct relatives", () => {
    const directIds = new Set(["mom", "dad", "sibling"]);
    const result = computeExtendedFamily("me", allPeople, baseRelationships, directIds);
    const directIdsList = [...directIds];
    for (const member of result) {
      expect(directIdsList.includes(member.personId)).toBe(false);
    }
  });

  it("deduplicates by closest relationship (shortest hop wins)", () => {
    const relationships: RelationshipRecord[] = [
      rel("mom", "me", "PARENT_OF"),
      rel("dad", "me", "PARENT_OF"),
      rel("gma", "mom", "PARENT_OF"),
      rel("gma", "uncle", "PARENT_OF"),
      rel("mom", "uncle", "SIBLING_OF"),
      rel("uncle", "cousin1", "PARENT_OF"),
      rel("gpa", "mom", "PARENT_OF"),
      rel("gpa", "uncle", "PARENT_OF")
    ];
    const directIds = new Set(["mom", "dad"]);
    const result = computeExtendedFamily("me", allPeople, relationships, directIds);
    const uncleEntries = result.filter((m) => m.personId === "uncle");
    expect(uncleEntries).toHaveLength(1);
    expect(uncleEntries[0]?.label).toBe("Uncle/Aunt");
  });

  it("excludes the selected person from results", () => {
    const directIds = new Set<string>();
    const result = computeExtendedFamily("me", allPeople, baseRelationships, directIds);
    expect(result.find((m) => m.personId === "me")).toBeUndefined();
  });

  it("handles cycles without infinite loop", () => {
    const cyclicRelationships: RelationshipRecord[] = [
      rel("mom", "me", "PARENT_OF"),
      rel("me", "mom", "PARENT_OF")
    ];
    const directIds = new Set(["mom"]);
    const result = computeExtendedFamily("me", allPeople, cyclicRelationships, directIds);
    expect(result).toBeDefined();
  });

  it("skips people not in the people array", () => {
    const relationships: RelationshipRecord[] = [
      rel("mom", "me", "PARENT_OF"),
      rel("unknown_person", "mom", "PARENT_OF")
    ];
    const directIds = new Set(["mom"]);
    const result = computeExtendedFamily("me", allPeople, relationships, directIds);
    const unknownEntries = result.filter((m) => m.personId === "unknown_person");
    expect(unknownEntries).toHaveLength(0);
  });

  it("returns empty array when selectedPersonId is not in people", () => {
    const result = computeExtendedFamily("nonexistent", allPeople, baseRelationships, new Set());
    expect(result).toEqual([]);
  });

  it("returns empty array when no relationships exist", () => {
    const result = computeExtendedFamily("me", allPeople, [], new Set());
    expect(result).toEqual([]);
  });

  it("sorts results by hop count then label then name", () => {
    const directIds = new Set(["mom", "dad", "sibling"]);
    const result = computeExtendedFamily("me", allPeople, baseRelationships, directIds);

    for (let i = 1; i < result.length; i += 1) {
      const prev = result[i - 1]!;
      const curr = result[i]!;
      const hopCompare = prev.hopCount - curr.hopCount;
      if (hopCompare === 0) {
        const labelCompare = prev.label.localeCompare(curr.label);
        if (labelCompare === 0) {
          expect(prev.personName.localeCompare(curr.personName)).toBeLessThanOrEqual(0);
        } else {
          expect(labelCompare).toBeLessThanOrEqual(0);
        }
      } else {
        expect(hopCompare).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe("computeInLawFamily", () => {
  const people = [
    person("me", "Me"),
    person("spouse", "Spouse"),
    person("spouseMom", "Spouse Mom"),
    person("spouseDad", "Spouse Dad"),
    person("spouseSibling", "Spouse Sibling"),
    person("siblingSpouse", "Sibling Spouse"),
    person("mySibling", "My Sibling"),
    person("myChild", "My Child"),
    person("childSpouse", "Child Spouse"),
    person("spouseGrandParent", "Spouse Grandparent"),
    person("spouseUncle", "Spouse Uncle"),
    person("spouseCousin", "Spouse Cousin")
  ];

  const relationships: RelationshipRecord[] = [
    rel("spouse", "me", "SPOUSE_OF"),
    rel("spouseMom", "spouse", "PARENT_OF"),
    rel("spouseDad", "spouse", "PARENT_OF"),
    rel("spouseMom", "spouseSibling", "PARENT_OF"),
    rel("mySibling", "me", "SIBLING_OF"),
    rel("siblingSpouse", "mySibling", "SPOUSE_OF"),
    rel("me", "myChild", "PARENT_OF"),
    rel("childSpouse", "myChild", "SPOUSE_OF"),
    rel("spouseGrandParent", "spouseMom", "PARENT_OF"),
    rel("spouseMom", "spouseUncle", "SIBLING_OF"),
    rel("spouseUncle", "spouseCousin", "PARENT_OF")
  ];

  it("finds immediate in-law relationships", () => {
    const excluded = new Set<string>(["spouse", "mySibling", "myChild"]);
    const result = computeInLawFamily("me", people, relationships, excluded);
    expect(result.find((member) => member.personId === "spouseMom")?.label).toBe("Parent-in-law");
    expect(result.find((member) => member.personId === "childSpouse")?.label).toBe("Child-in-law");
    expect(result.find((member) => member.personId === "siblingSpouse")?.label).toBe("Sibling-in-law");
  });

  it("finds extended in-law relationships", () => {
    const excluded = new Set<string>(["spouse", "mySibling", "myChild"]);
    const result = computeInLawFamily("me", people, relationships, excluded);
    expect(result.find((member) => member.personId === "spouseGrandParent")?.label).toBe(
      "Grandparent-in-law"
    );
    expect(result.find((member) => member.personId === "spouseUncle")?.label).toBe("Uncle/Aunt-in-law");
    expect(result.find((member) => member.personId === "spouseCousin")?.label).toBe("Cousin-in-law");
  });
});
