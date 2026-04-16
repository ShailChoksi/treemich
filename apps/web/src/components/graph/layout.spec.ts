import { describe, expect, it } from "vitest";
import type { ImmichPerson, RelationshipRecord } from "../../lib/api";
import {
  buildDirectionalNeighborBuckets,
  buildParentChildIndex,
  getLastNameKey,
  hashToNumber,
  positionPeople
} from "./layout";

const getPositionById = (
  people: ImmichPerson[],
  relationships: RelationshipRecord[],
  options?: Parameters<typeof positionPeople>[2]
) => {
  const positioned = positionPeople(people, relationships, options);
  return new Map(positioned.map((entry) => [entry.person.id, entry.position]));
};

const distance = (first: [number, number, number], second: [number, number, number]) => {
  const dx = first[0] - second[0];
  const dy = first[1] - second[1];
  const dz = first[2] - second[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

describe("layout utilities", () => {
  it("hashToNumber is deterministic and non-negative", () => {
    expect(hashToNumber("Smith")).toBe(hashToNumber("Smith"));
    expect(hashToNumber("Smith")).toBeGreaterThanOrEqual(0);
  });

  it("extracts last name key and handles edge cases", () => {
    expect(getLastNameKey("Anna Smith")).toBe("smith");
    expect(getLastNameKey("  Anna   Marie Smith   ")).toBe("smith");
    expect(getLastNameKey("Anna")).toBe("_unknown");
    expect(getLastNameKey("")).toBe("_unknown");
  });

  it("buildParentChildIndex normalizes and deduplicates parent-child edges", () => {
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "c1", toPersonId: "p1", type: "CHILD_OF" },
      { fromPersonId: "p2", toPersonId: "c1", type: "PARENT_OF" }
    ];

    const index = buildParentChildIndex(relationships);
    expect(index.edges).toEqual(
      expect.arrayContaining([
        { parentId: "p1", childId: "c1" },
        { parentId: "p2", childId: "c1" }
      ])
    );
    expect(index.edges).toHaveLength(2);
    expect(index.parentsByChild.get("c1")).toEqual(new Set(["p1", "p2"]));
    expect(index.childrenByParent.get("p1")).toEqual(new Set(["c1"]));
  });

  it("buildDirectionalNeighborBuckets groups vertical and non-vertical links", () => {
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "parent", toPersonId: "self", type: "PARENT_OF" },
      { fromPersonId: "self", toPersonId: "child", type: "PARENT_OF" },
      { fromPersonId: "self", toPersonId: "spouse", type: "SPOUSE_OF" },
      { fromPersonId: "friend", toPersonId: "self", type: "FRIEND_OF" },
      { fromPersonId: "self", toPersonId: "pet", type: "PET_OF" }
    ];

    const buckets = buildDirectionalNeighborBuckets("self", relationships);

    expect(buckets.up).toEqual(["parent"]);
    expect(buckets.down).toEqual(["child"]);
    expect(new Set(buckets.side)).toEqual(new Set(["spouse", "friend", "pet"]));
  });
});

describe("positionPeople", () => {
  it("places parents above children", () => {
    const people: ImmichPerson[] = [
      { id: "p1", name: "Mike Smith" },
      { id: "c1", name: "John Smith" }
    ];
    const relationships: RelationshipRecord[] = [{ fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF" }];

    const positions = getPositionById(people, relationships);
    const parent = positions.get("p1");
    const child = positions.get("c1");

    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(parent![1]).toBeGreaterThan(child![1]);
  });

  it("keeps spouses on the same generation level", () => {
    const people: ImmichPerson[] = [
      { id: "s1", name: "Anna Smith" },
      { id: "s2", name: "Ben Smith" }
    ];
    const relationships: RelationshipRecord[] = [{ fromPersonId: "s1", toPersonId: "s2", type: "SPOUSE_OF" }];

    const positions = getPositionById(people, relationships);
    const first = positions.get("s1");
    const second = positions.get("s2");

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(Math.abs(first![1] - second![1])).toBeLessThan(0.5);
  });

  it("aligns spouses even when their trees have different depth", () => {
    const people: ImmichPerson[] = [
      { id: "a-grandparent", name: "A Grandparent" },
      { id: "a-parent", name: "A Parent" },
      { id: "a-person", name: "A Person" },
      { id: "b-person", name: "B Person" },
      { id: "b-child", name: "B Child" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "a-grandparent", toPersonId: "a-parent", type: "PARENT_OF" },
      { fromPersonId: "a-parent", toPersonId: "a-person", type: "PARENT_OF" },
      { fromPersonId: "a-person", toPersonId: "b-person", type: "SPOUSE_OF" },
      { fromPersonId: "b-person", toPersonId: "b-child", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships);
    const aPerson = positions.get("a-person");
    const bPerson = positions.get("b-person");
    const bChild = positions.get("b-child");

    expect(aPerson).toBeDefined();
    expect(bPerson).toBeDefined();
    expect(bChild).toBeDefined();
    expect(Math.abs(aPerson![1] - bPerson![1])).toBeLessThan(0.001);
    expect(bPerson![1]).toBeGreaterThan(bChild![1]);
  });

  it("aligns co-parents to same generation even without explicit spouse edge", () => {
    const people: ImmichPerson[] = [
      { id: "grandparent", name: "Grand Parent" },
      { id: "parentA", name: "Parent A" },
      { id: "parentB", name: "Parent B" },
      { id: "child1", name: "Child One" },
      { id: "child2", name: "Child Two" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "grandparent", toPersonId: "parentA", type: "PARENT_OF" },
      { fromPersonId: "parentA", toPersonId: "child1", type: "PARENT_OF" },
      { fromPersonId: "parentA", toPersonId: "child2", type: "PARENT_OF" },
      { fromPersonId: "parentB", toPersonId: "child1", type: "PARENT_OF" },
      { fromPersonId: "parentB", toPersonId: "child2", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships);
    const parentA = positions.get("parentA");
    const parentB = positions.get("parentB");
    const child1 = positions.get("child1");

    expect(parentA).toBeDefined();
    expect(parentB).toBeDefined();
    expect(child1).toBeDefined();
    expect(Math.abs(parentA![1] - parentB![1])).toBeLessThan(0.001);
    expect(parentA![1]).toBeGreaterThan(child1![1]);
  });

  it("keeps co-parents with shared children visually grouped without spouse edge", () => {
    const people: ImmichPerson[] = [
      { id: "grandpaA", name: "Grandpa A" },
      { id: "grandpaB", name: "Grandpa B" },
      { id: "parentA", name: "Parent A" },
      { id: "parentB", name: "Parent B" },
      { id: "aUncle", name: "A Uncle" },
      { id: "bAunt", name: "B Aunt" },
      { id: "child1", name: "Child One" },
      { id: "child2", name: "Child Two" },
      { id: "child3", name: "Child Three" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "grandpaA", toPersonId: "parentA", type: "PARENT_OF" },
      { fromPersonId: "grandpaA", toPersonId: "aUncle", type: "PARENT_OF" },
      { fromPersonId: "grandpaB", toPersonId: "parentB", type: "PARENT_OF" },
      { fromPersonId: "grandpaB", toPersonId: "bAunt", type: "PARENT_OF" },
      { fromPersonId: "parentA", toPersonId: "child1", type: "PARENT_OF" },
      { fromPersonId: "parentB", toPersonId: "child1", type: "PARENT_OF" },
      { fromPersonId: "parentA", toPersonId: "child2", type: "PARENT_OF" },
      { fromPersonId: "parentB", toPersonId: "child2", type: "PARENT_OF" },
      { fromPersonId: "parentA", toPersonId: "child3", type: "PARENT_OF" },
      { fromPersonId: "parentB", toPersonId: "child3", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, { familyViewStyle: "generationTree" });
    const parentA = positions.get("parentA");
    const parentB = positions.get("parentB");
    const child1 = positions.get("child1");
    const child2 = positions.get("child2");
    const child3 = positions.get("child3");

    expect(parentA).toBeDefined();
    expect(parentB).toBeDefined();
    expect(child1).toBeDefined();
    expect(child2).toBeDefined();
    expect(child3).toBeDefined();

    const parentMidX = ((parentA?.[0] ?? 0) + (parentB?.[0] ?? 0)) / 2;
    const childrenMidX = ((child1?.[0] ?? 0) + (child2?.[0] ?? 0) + (child3?.[0] ?? 0)) / 3;
    expect(Math.abs((parentA?.[0] ?? 0) - (parentB?.[0] ?? 0))).toBeLessThan(5);
    expect(Math.abs(childrenMidX - parentMidX)).toBeLessThan(0.8);
  });

  it("keeps co-parent grouping stable up through grandparent generation", () => {
    const people: ImmichPerson[] = [
      { id: "gpa1", name: "Grandparent A1" },
      { id: "gpa2", name: "Grandparent A2" },
      { id: "gpb1", name: "Grandparent B1" },
      { id: "gpb2", name: "Grandparent B2" },
      { id: "pa", name: "Parent A" },
      { id: "pb", name: "Parent B" },
      { id: "uncleA", name: "Uncle A" },
      { id: "auntB", name: "Aunt B" },
      { id: "c1", name: "Child 1" },
      { id: "c2", name: "Child 2" },
      { id: "c3", name: "Child 3" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "gpa1", toPersonId: "pa", type: "PARENT_OF" },
      { fromPersonId: "gpa2", toPersonId: "pa", type: "PARENT_OF" },
      { fromPersonId: "gpa1", toPersonId: "uncleA", type: "PARENT_OF" },
      { fromPersonId: "gpb1", toPersonId: "pb", type: "PARENT_OF" },
      { fromPersonId: "gpb2", toPersonId: "pb", type: "PARENT_OF" },
      { fromPersonId: "gpb1", toPersonId: "auntB", type: "PARENT_OF" },
      { fromPersonId: "pa", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "pb", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "pa", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "pb", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "pa", toPersonId: "c3", type: "PARENT_OF" },
      { fromPersonId: "pb", toPersonId: "c3", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, { familyViewStyle: "generationTree" });
    const pa = positions.get("pa");
    const pb = positions.get("pb");
    const c1 = positions.get("c1");
    const c2 = positions.get("c2");
    const c3 = positions.get("c3");
    const gpa1 = positions.get("gpa1");
    const gpa2 = positions.get("gpa2");
    const gpb1 = positions.get("gpb1");
    const gpb2 = positions.get("gpb2");

    expect(pa).toBeDefined();
    expect(pb).toBeDefined();
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c3).toBeDefined();
    expect(gpa1).toBeDefined();
    expect(gpa2).toBeDefined();
    expect(gpb1).toBeDefined();
    expect(gpb2).toBeDefined();

    const parentMidX = ((pa?.[0] ?? 0) + (pb?.[0] ?? 0)) / 2;
    const childrenMidX = ((c1?.[0] ?? 0) + (c2?.[0] ?? 0) + (c3?.[0] ?? 0)) / 3;
    expect(Math.abs(childrenMidX - parentMidX)).toBeLessThan(0.8);

    const grandAGroupMidX = ((gpa1?.[0] ?? 0) + (gpa2?.[0] ?? 0)) / 2;
    const grandBGroupMidX = ((gpb1?.[0] ?? 0) + (gpb2?.[0] ?? 0)) / 2;
    expect(Math.abs((pa?.[0] ?? 0) - grandAGroupMidX)).toBeLessThan(3.5);
    expect(Math.abs((pb?.[0] ?? 0) - grandBGroupMidX)).toBeLessThan(3.5);
  });

  it("keeps siblings on the same generation after co-parent depth adjustments", () => {
    const people: ImmichPerson[] = [
      { id: "parent", name: "Parent" },
      { id: "sibA", name: "Sibling A" },
      { id: "sibB", name: "Sibling B" },
      { id: "spGrand", name: "Spouse Grandparent" },
      { id: "spParent", name: "Spouse Parent" },
      { id: "spouse", name: "Spouse" },
      { id: "child", name: "Child" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "parent", toPersonId: "sibA", type: "PARENT_OF" },
      { fromPersonId: "parent", toPersonId: "sibB", type: "PARENT_OF" },
      { fromPersonId: "spGrand", toPersonId: "spParent", type: "PARENT_OF" },
      { fromPersonId: "spParent", toPersonId: "spouse", type: "PARENT_OF" },
      { fromPersonId: "sibA", toPersonId: "spouse", type: "SPOUSE_OF" },
      { fromPersonId: "sibA", toPersonId: "child", type: "PARENT_OF" },
      { fromPersonId: "spouse", toPersonId: "child", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, { familyViewStyle: "generationTree" });
    const siblingA = positions.get("sibA");
    const siblingB = positions.get("sibB");
    const parent = positions.get("parent");

    expect(siblingA).toBeDefined();
    expect(siblingB).toBeDefined();
    expect(parent).toBeDefined();
    expect(Math.abs((siblingA?.[1] ?? 0) - (siblingB?.[1] ?? 0))).toBeLessThan(0.001);
    expect(parent?.[1] ?? 0).toBeGreaterThan(siblingA?.[1] ?? 0);
  });

  it("places smaller spouse-side relatives perpendicular to large partner tree", () => {
    const people: ImmichPerson[] = [
      { id: "gpa1", name: "A Great Grandpa" },
      { id: "gma1", name: "A Great Grandma" },
      { id: "pa", name: "A Parent" },
      { id: "a", name: "Person A" },
      { id: "aSibling", name: "A Sibling" },
      { id: "b", name: "Spouse B" },
      { id: "bp", name: "B Parent" },
      { id: "c1", name: "Child One" },
      { id: "c2", name: "Child Two" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "gpa1", toPersonId: "pa", type: "PARENT_OF" },
      { fromPersonId: "gma1", toPersonId: "pa", type: "PARENT_OF" },
      { fromPersonId: "pa", toPersonId: "a", type: "PARENT_OF" },
      { fromPersonId: "pa", toPersonId: "aSibling", type: "PARENT_OF" },
      { fromPersonId: "a", toPersonId: "b", type: "SPOUSE_OF" },
      { fromPersonId: "bp", toPersonId: "b", type: "PARENT_OF" },
      { fromPersonId: "a", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "b", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "a", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "b", toPersonId: "c2", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, { familyViewStyle: "generationTree" });
    const personA = positions.get("a");
    const spouseB = positions.get("b");
    const bParent = positions.get("bp");
    const aParent = positions.get("pa");

    expect(personA).toBeDefined();
    expect(spouseB).toBeDefined();
    expect(bParent).toBeDefined();
    expect(aParent).toBeDefined();
    expect(Math.abs((bParent?.[2] ?? 0) - (spouseB?.[2] ?? 0))).toBeGreaterThan(0.5);
    expect(Math.abs((aParent?.[2] ?? 0) - (personA?.[2] ?? 0))).toBeLessThan(0.3);
  });

  it("places smaller co-parent side perpendicular even without spouse edge", () => {
    const people: ImmichPerson[] = [
      { id: "gpa1", name: "A Great Grandpa" },
      { id: "gma1", name: "A Great Grandma" },
      { id: "pa", name: "A Parent" },
      { id: "a", name: "Person A" },
      { id: "aSibling", name: "A Sibling" },
      { id: "b", name: "Co-parent B" },
      { id: "bp", name: "B Parent" },
      { id: "c1", name: "Child One" },
      { id: "c2", name: "Child Two" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "gpa1", toPersonId: "pa", type: "PARENT_OF" },
      { fromPersonId: "gma1", toPersonId: "pa", type: "PARENT_OF" },
      { fromPersonId: "pa", toPersonId: "a", type: "PARENT_OF" },
      { fromPersonId: "pa", toPersonId: "aSibling", type: "PARENT_OF" },
      { fromPersonId: "bp", toPersonId: "b", type: "PARENT_OF" },
      { fromPersonId: "a", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "b", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "a", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "b", toPersonId: "c2", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, { familyViewStyle: "generationTree" });
    const coParentB = positions.get("b");
    const bParent = positions.get("bp");
    const personA = positions.get("a");
    const aParent = positions.get("pa");

    expect(coParentB).toBeDefined();
    expect(bParent).toBeDefined();
    expect(personA).toBeDefined();
    expect(aParent).toBeDefined();
    expect(Math.abs((bParent?.[2] ?? 0) - (coParentB?.[2] ?? 0))).toBeGreaterThan(0.5);
    expect(Math.abs((aParent?.[2] ?? 0) - (personA?.[2] ?? 0))).toBeLessThan(0.3);
  });

  it("aligns siblings on the same depth", () => {
    const people: ImmichPerson[] = [
      { id: "parent", name: "Mary Lee" },
      { id: "sibA", name: "Alice Lee" },
      { id: "sibB", name: "Bob Lee" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "parent", toPersonId: "sibA", type: "PARENT_OF" },
      { fromPersonId: "parent", toPersonId: "sibB", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships);
    const first = positions.get("sibA");
    const second = positions.get("sibB");

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(Math.abs(first![1] - second![1])).toBeLessThan(0.001);
  });

  it("separates disconnected components", () => {
    const people: ImmichPerson[] = [
      { id: "a1", name: "A One" },
      { id: "a2", name: "A Two" },
      { id: "b1", name: "B One" },
      { id: "b2", name: "B Two" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "a1", toPersonId: "a2", type: "PARENT_OF" },
      { fromPersonId: "b1", toPersonId: "b2", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships);
    const a = positions.get("a1");
    const b = positions.get("b1");

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(Math.abs(a![0] - b![0]) + Math.abs(a![2] - b![2])).toBeGreaterThan(1);
  });

  it("spreads disconnected families apart in generation view", () => {
    const people: ImmichPerson[] = [
      { id: "p1", name: "Parent 1" },
      { id: "c1", name: "Child 1" },
      { id: "p2", name: "Parent 2" },
      { id: "c2", name: "Child 2" },
      { id: "p3", name: "Parent 3" },
      { id: "c3", name: "Child 3" },
      { id: "p4", name: "Parent 4" },
      { id: "c4", name: "Child 4" },
      { id: "p5", name: "Parent 5" },
      { id: "c5", name: "Child 5" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "p2", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "p3", toPersonId: "c3", type: "PARENT_OF" },
      { fromPersonId: "p4", toPersonId: "c4", type: "PARENT_OF" },
      { fromPersonId: "p5", toPersonId: "c5", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, { familyViewStyle: "generationTree" });
    const parentSlots = ["p1", "p2", "p3", "p4", "p5"].map((id) => {
      const position = positions.get(id);
      return position ? `${position[0].toFixed(3)}|${position[2].toFixed(3)}` : "missing";
    });
    expect(new Set(parentSlots).size).toBe(5);
  });

  it("prevents overlap between a very large family component and another disconnected tree", () => {
    const bigFamilyPeople: ImmichPerson[] = [
      { id: "bp0", name: "Big Parent 0" },
      { id: "bp1", name: "Big Parent 1" },
      { id: "bc0", name: "Big Child 0" },
      { id: "bc1", name: "Big Child 1" },
      { id: "bc2", name: "Big Child 2" },
      { id: "bc3", name: "Big Child 3" },
      { id: "bc4", name: "Big Child 4" },
      { id: "bc5", name: "Big Child 5" },
      { id: "bg0", name: "Big Grandchild 0" },
      { id: "bg1", name: "Big Grandchild 1" },
      { id: "bg2", name: "Big Grandchild 2" },
      { id: "bg3", name: "Big Grandchild 3" },
      { id: "bg4", name: "Big Grandchild 4" },
      { id: "bg5", name: "Big Grandchild 5" }
    ];
    const smallFamilyPeople: ImmichPerson[] = [
      { id: "sp0", name: "Small Parent 0" },
      { id: "sc0", name: "Small Child 0" }
    ];
    const people: ImmichPerson[] = [...bigFamilyPeople, ...smallFamilyPeople];

    const relationships: RelationshipRecord[] = [
      { fromPersonId: "bp0", toPersonId: "bp1", type: "SPOUSE_OF" },
      { fromPersonId: "bp0", toPersonId: "bc0", type: "PARENT_OF" },
      { fromPersonId: "bp1", toPersonId: "bc1", type: "PARENT_OF" },
      { fromPersonId: "bp0", toPersonId: "bc2", type: "PARENT_OF" },
      { fromPersonId: "bp1", toPersonId: "bc3", type: "PARENT_OF" },
      { fromPersonId: "bp0", toPersonId: "bc4", type: "PARENT_OF" },
      { fromPersonId: "bp1", toPersonId: "bc5", type: "PARENT_OF" },
      { fromPersonId: "bc0", toPersonId: "bg0", type: "PARENT_OF" },
      { fromPersonId: "bc1", toPersonId: "bg1", type: "PARENT_OF" },
      { fromPersonId: "bc2", toPersonId: "bg2", type: "PARENT_OF" },
      { fromPersonId: "bc3", toPersonId: "bg3", type: "PARENT_OF" },
      { fromPersonId: "bc4", toPersonId: "bg4", type: "PARENT_OF" },
      { fromPersonId: "bc5", toPersonId: "bg5", type: "PARENT_OF" },
      { fromPersonId: "sp0", toPersonId: "sc0", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, { familyViewStyle: "generationTree" });
    const boundsFor = (ids: string[]) => {
      const coords = ids
        .map((id) => positions.get(id))
        .filter((position): position is [number, number, number] => Boolean(position));
      return {
        minX: Math.min(...coords.map((position) => position[0])),
        maxX: Math.max(...coords.map((position) => position[0])),
        minZ: Math.min(...coords.map((position) => position[2])),
        maxZ: Math.max(...coords.map((position) => position[2]))
      };
    };

    const bigBounds = boundsFor(bigFamilyPeople.map((person) => person.id));
    const smallBounds = boundsFor(smallFamilyPeople.map((person) => person.id));
    const overlapsX = bigBounds.minX < smallBounds.maxX && smallBounds.minX < bigBounds.maxX;
    const overlapsZ = bigBounds.minZ < smallBounds.maxZ && smallBounds.minZ < bigBounds.maxZ;
    expect(overlapsX && overlapsZ).toBe(false);
  });

  it("positions a single person with finite coordinates", () => {
    const people: ImmichPerson[] = [{ id: "solo", name: "Solo Person" }];
    const positions = getPositionById(people, []);
    const solo = positions.get("solo");

    expect(solo).toBeDefined();
    expect(Number.isFinite(solo![0])).toBe(true);
    expect(Number.isFinite(solo![1])).toBe(true);
    expect(Number.isFinite(solo![2])).toBe(true);
  });

  it("positions photo clusters closer within cluster than across clusters", () => {
    const people: ImmichPerson[] = [
      { id: "a", name: "Alice" },
      { id: "b", name: "Bob" },
      { id: "c", name: "Carol" },
      { id: "d", name: "Dan" }
    ];
    const positions = getPositionById(people, [], {
      mode: "photo",
      photoClusters: [
        { id: "c1", personIds: ["a", "b"], size: 2 },
        { id: "c2", personIds: ["c", "d"], size: 2 }
      ]
    });
    const a = positions.get("a");
    const b = positions.get("b");
    const c = positions.get("c");

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    expect(distance(a!, b!)).toBeLessThan(distance(a!, c!));
  });

  it("keeps bottom-generation nodes spaced enough to remain clickable", () => {
    const people: ImmichPerson[] = [
      { id: "mom", name: "Mary Family" },
      { id: "dad", name: "Dan Family" },
      { id: "child1", name: "Alex Family" },
      { id: "child2", name: "Blair Family" },
      { id: "child3", name: "Casey Family" },
      { id: "child4", name: "Devon Family" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "mom", toPersonId: "dad", type: "SPOUSE_OF" },
      { fromPersonId: "mom", toPersonId: "child1", type: "PARENT_OF" },
      { fromPersonId: "mom", toPersonId: "child2", type: "PARENT_OF" },
      { fromPersonId: "mom", toPersonId: "child3", type: "PARENT_OF" },
      { fromPersonId: "dad", toPersonId: "child1", type: "PARENT_OF" },
      { fromPersonId: "dad", toPersonId: "child2", type: "PARENT_OF" },
      { fromPersonId: "dad", toPersonId: "child4", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships);
    const children = ["child1", "child2", "child3", "child4"]
      .map((id) => positions.get(id))
      .filter((position): position is [number, number, number] => Boolean(position));

    expect(children).toHaveLength(4);
    const uniqueXY = new Set(
      children.map((position) => `${position[0].toFixed(3)}|${position[1].toFixed(3)}`)
    );
    expect(uniqueXY.size).toBe(children.length);
  });

  it("keeps children centered below their parent pair even with nearby sibling branches", () => {
    const people: ImmichPerson[] = [
      { id: "rootA", name: "Root A" },
      { id: "rootB", name: "Root B" },
      { id: "mainA", name: "Main A" },
      { id: "mainB", name: "Main B" },
      { id: "mainChild", name: "Main Child" },
      { id: "siblingA", name: "Sibling A" },
      { id: "siblingPartner", name: "Sibling Partner" },
      { id: "siblingChild", name: "Sibling Child" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "rootA", toPersonId: "mainA", type: "PARENT_OF" },
      { fromPersonId: "rootA", toPersonId: "siblingA", type: "PARENT_OF" },
      { fromPersonId: "rootB", toPersonId: "mainB", type: "PARENT_OF" },
      { fromPersonId: "mainA", toPersonId: "mainB", type: "SPOUSE_OF" },
      { fromPersonId: "mainA", toPersonId: "mainChild", type: "PARENT_OF" },
      { fromPersonId: "mainB", toPersonId: "mainChild", type: "PARENT_OF" },
      { fromPersonId: "siblingA", toPersonId: "siblingPartner", type: "SPOUSE_OF" },
      { fromPersonId: "siblingA", toPersonId: "siblingChild", type: "PARENT_OF" },
      { fromPersonId: "siblingPartner", toPersonId: "siblingChild", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, { familyViewStyle: "generationTree" });
    const mainA = positions.get("mainA");
    const mainB = positions.get("mainB");
    const mainChild = positions.get("mainChild");

    expect(mainA).toBeDefined();
    expect(mainB).toBeDefined();
    expect(mainChild).toBeDefined();
    const parentMidX = ((mainA?.[0] ?? 0) + (mainB?.[0] ?? 0)) / 2;
    expect(Math.abs((mainChild?.[0] ?? 0) - parentMidX)).toBeLessThan(0.3);
  });

  it("places people not present in cluster payload", () => {
    const people: ImmichPerson[] = [
      { id: "in-cluster", name: "In Cluster" },
      { id: "missing", name: "Missing From Cluster" }
    ];
    const positions = getPositionById(people, [], {
      mode: "photo",
      photoClusters: [{ id: "c1", personIds: ["in-cluster"], size: 1 }]
    });
    const missing = positions.get("missing");
    expect(missing).toBeDefined();
    expect(Number.isFinite(missing![0])).toBe(true);
    expect(Number.isFinite(missing![1])).toBe(true);
    expect(Number.isFinite(missing![2])).toBe(true);
  });
});
