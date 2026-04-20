import { describe, expect, it } from "vitest";
import { buildGraphLayoutRevision, type GraphLayoutRequest } from "@treemich/shared";
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

  it("buildParentChildIndex normalizes parent-child edges", () => {
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "c1", toPersonId: "p1", type: "CHILD_OF" },
      { fromPersonId: "p2", toPersonId: "c1", type: "PARENT_OF" }
    ];
    const index = buildParentChildIndex(relationships);
    expect(index.edges).toHaveLength(2);
    expect(index.parentsByChild.get("c1")).toEqual(new Set(["p1", "p2"]));
  });

  it("buildDirectionalNeighborBuckets groups vertical and side links", () => {
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "parent", toPersonId: "self", type: "PARENT_OF" },
      { fromPersonId: "self", toPersonId: "child", type: "PARENT_OF" },
      { fromPersonId: "self", toPersonId: "spouse", type: "SPOUSE_OF" },
      { fromPersonId: "friend", toPersonId: "self", type: "FRIEND_OF" }
    ];
    const buckets = buildDirectionalNeighborBuckets("self", relationships);
    expect(buckets.up).toEqual(["parent"]);
    expect(buckets.down).toEqual(["child"]);
    expect(new Set(buckets.side)).toEqual(new Set(["spouse", "friend"]));
  });
});

describe("deterministic family layout invariants", () => {
  it("keeps deterministic positions through worker-style serialization", () => {
    const people: ImmichPerson[] = [
      { id: "p1", name: "Parent One" },
      { id: "p2", name: "Parent Two" },
      { id: "c1", name: "Child One" },
      { id: "c2", name: "Child Two" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "p2", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "p1", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "p2", toPersonId: "c2", type: "PARENT_OF" }
    ];

    const syncPositions = positionPeople(people, relationships, {});
    const serialized = syncPositions.map((item) => ({
      personId: item.person.id,
      position: item.position
    }));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const reconstructed = serialized
      .map((entry) => {
        const person = peopleById.get(entry.personId);
        return person ? { person, position: entry.position } : null;
      })
      .filter((entry): entry is { person: ImmichPerson; position: [number, number, number] } => !!entry);

    expect(new Map(reconstructed.map((item) => [item.person.id, item.position]))).toEqual(
      new Map(syncPositions.map((item) => [item.person.id, item.position]))
    );
  });

  it("places parents above children", () => {
    const people: ImmichPerson[] = [
      { id: "p1", name: "Parent One" },
      { id: "p2", name: "Parent Two" },
      { id: "c1", name: "Child One" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "p2", toPersonId: "c1", type: "PARENT_OF" }
    ];
    const positions = getPositionById(people, relationships, {});
    expect((positions.get("p1")?.[1] ?? 0) > (positions.get("c1")?.[1] ?? 0)).toBe(true);
    expect((positions.get("p2")?.[1] ?? 0) > (positions.get("c1")?.[1] ?? 0)).toBe(true);
  });

  it("keeps couple members at fixed gap", () => {
    const people: ImmichPerson[] = [
      { id: "a", name: "Alex A" },
      { id: "b", name: "Blair B" },
      { id: "c", name: "Casey C" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "a", toPersonId: "b", type: "SPOUSE_OF" },
      { fromPersonId: "a", toPersonId: "c", type: "PARENT_OF" },
      { fromPersonId: "b", toPersonId: "c", type: "PARENT_OF" }
    ];
    const positions = getPositionById(people, relationships, {});
    const first = positions.get("a");
    const second = positions.get("b");
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const coupleGap = Math.abs((first?.[0] ?? 0) - (second?.[0] ?? 0));
    expect(coupleGap).toBeGreaterThan(3.2);
    expect(coupleGap).toBeLessThan(4.8);
  });

  it("keeps non-spouse same-generation nodes separated", () => {
    const people: ImmichPerson[] = [
      { id: "g1", name: "Grand 1" },
      { id: "g2", name: "Grand 2" },
      { id: "a1", name: "Adult 1" },
      { id: "a2", name: "Adult 2" },
      { id: "a3", name: "Adult 3" },
      { id: "s1", name: "Spouse 1" },
      { id: "s2", name: "Spouse 2" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "g1", toPersonId: "a1", type: "PARENT_OF" },
      { fromPersonId: "g2", toPersonId: "a1", type: "PARENT_OF" },
      { fromPersonId: "g1", toPersonId: "a2", type: "PARENT_OF" },
      { fromPersonId: "g2", toPersonId: "a2", type: "PARENT_OF" },
      { fromPersonId: "g1", toPersonId: "a3", type: "PARENT_OF" },
      { fromPersonId: "g2", toPersonId: "a3", type: "PARENT_OF" },
      { fromPersonId: "a1", toPersonId: "s1", type: "SPOUSE_OF" },
      { fromPersonId: "a2", toPersonId: "s2", type: "SPOUSE_OF" }
    ];
    const positions = getPositionById(people, relationships, {});
    const spousePairs = new Set(["a1|s1", "s1|a1", "a2|s2", "s2|a2"]);
    const sameRow = ["a1", "a2", "a3", "s1", "s2"];
    for (let firstIndex = 0; firstIndex < sameRow.length; firstIndex += 1) {
      const firstId = sameRow[firstIndex];
      const first = firstId ? positions.get(firstId) : undefined;
      if (!firstId || !first) {
        continue;
      }
      for (let secondIndex = firstIndex + 1; secondIndex < sameRow.length; secondIndex += 1) {
        const secondId = sameRow[secondIndex];
        const second = secondId ? positions.get(secondId) : undefined;
        if (!secondId || !second) {
          continue;
        }
        if (spousePairs.has(`${firstId}|${secondId}`)) {
          continue;
        }
        expect(Math.abs(first[0] - second[0])).toBeGreaterThanOrEqual(1.9);
      }
    }
  });

  it("centers children under their family unit", () => {
    const people: ImmichPerson[] = [
      { id: "a", name: "Parent A" },
      { id: "b", name: "Parent B" },
      { id: "c1", name: "Child 1" },
      { id: "c2", name: "Child 2" },
      { id: "c3", name: "Child 3" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "a", toPersonId: "b", type: "SPOUSE_OF" },
      { fromPersonId: "a", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "b", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "a", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "b", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "a", toPersonId: "c3", type: "PARENT_OF" },
      { fromPersonId: "b", toPersonId: "c3", type: "PARENT_OF" }
    ];
    const positions = getPositionById(people, relationships, {});
    const parentCenter = ((positions.get("a")?.[0] ?? 0) + (positions.get("b")?.[0] ?? 0)) / 2;
    const childCenter =
      ((positions.get("c1")?.[0] ?? 0) + (positions.get("c2")?.[0] ?? 0) + (positions.get("c3")?.[0] ?? 0)) /
      3;
    expect(Math.abs(parentCenter - childCenter)).toBeLessThan(1.5);
  });

  it("keeps dense generation rows separated", () => {
    const people: ImmichPerson[] = [
      { id: "pa", name: "Parent A" },
      { id: "pb", name: "Parent B" }
    ];
    const relationships: RelationshipRecord[] = [{ fromPersonId: "pa", toPersonId: "pb", type: "SPOUSE_OF" }];
    for (let index = 0; index < 12; index += 1) {
      const childId = `child-${index}`;
      people.push({ id: childId, name: `Child ${index}` });
      relationships.push({ fromPersonId: "pa", toPersonId: childId, type: "PARENT_OF" });
      relationships.push({ fromPersonId: "pb", toPersonId: childId, type: "PARENT_OF" });
    }
    const positions = getPositionById(people, relationships, {});
    const childXs = people
      .filter((person) => person.id.startsWith("child-"))
      .map((person) => positions.get(person.id)?.[0])
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => left - right);
    let minGap = Number.POSITIVE_INFINITY;
    for (let index = 1; index < childXs.length; index += 1) {
      const current = childXs[index];
      const previous = childXs[index - 1];
      if (current === undefined || previous === undefined) {
        continue;
      }
      minGap = Math.min(minGap, current - previous);
    }
    expect(minGap).toBeGreaterThan(1.9);
  });

  it("reassigns branch when primary unit override changes", () => {
    const people: ImmichPerson[] = [
      { id: "g1", name: "Grand A1" },
      { id: "g2", name: "Grand A2" },
      { id: "g3", name: "Grand B1" },
      { id: "g4", name: "Grand B2" },
      { id: "pA", name: "Parent A" },
      { id: "pB", name: "Parent B" },
      { id: "pC", name: "Parent C" },
      { id: "x", name: "Person X" },
      { id: "child", name: "Child" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "g1", toPersonId: "pA", type: "PARENT_OF" },
      { fromPersonId: "g2", toPersonId: "pA", type: "PARENT_OF" },
      { fromPersonId: "g3", toPersonId: "pB", type: "PARENT_OF" },
      { fromPersonId: "g4", toPersonId: "pC", type: "PARENT_OF" },
      { fromPersonId: "pA", toPersonId: "x", type: "PARENT_OF" },
      { fromPersonId: "pB", toPersonId: "x", type: "PARENT_OF" },
      { fromPersonId: "pC", toPersonId: "x", type: "PARENT_OF" },
      { fromPersonId: "x", toPersonId: "child", type: "PARENT_OF" }
    ];

    const defaultPositions = getPositionById(people, relationships, {});
    const overriddenPositions = getPositionById(people, relationships, {
      primaryFamilyUnitByPersonId: {
        x: "pB|pC"
      }
    });

    const defaultX = defaultPositions.get("x")?.[0] ?? 0;
    const overrideX = overriddenPositions.get("x")?.[0] ?? 0;
    expect(Math.abs(defaultX - overrideX)).toBeGreaterThan(1.5);
  });

  it("places in-married spouse on the partner's row, not on their own depth-0 row", () => {
    // Scenario: A+B are married parents. C and D are their children.
    // C is married to E, who has parents J+K. D is married to G (no parents in tree).
    // C+E have child F. D+G have child H.
    // Bug was: G had no parents → depth 0, so the couple (D+G) computed unit depth
    // via Math.min(D=1, G=0) = 0, placing D and G on the grandparent row. Meanwhile
    // their child H was correctly at child depth, breaking the hierarchy visually.
    const people: ImmichPerson[] = [
      { id: "A", name: "A Parent" },
      { id: "B", name: "B Parent" },
      { id: "C", name: "C Child" },
      { id: "D", name: "D Child" },
      { id: "E", name: "E InMarried" },
      { id: "F", name: "F Grandchild" },
      { id: "G", name: "G InMarried" },
      { id: "H", name: "H Grandchild" },
      { id: "J", name: "J Grandparent" },
      { id: "K", name: "K Grandparent" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "A", toPersonId: "B", type: "SPOUSE_OF" },
      { fromPersonId: "A", toPersonId: "C", type: "PARENT_OF" },
      { fromPersonId: "B", toPersonId: "C", type: "PARENT_OF" },
      { fromPersonId: "A", toPersonId: "D", type: "PARENT_OF" },
      { fromPersonId: "B", toPersonId: "D", type: "PARENT_OF" },
      { fromPersonId: "C", toPersonId: "E", type: "SPOUSE_OF" },
      { fromPersonId: "C", toPersonId: "F", type: "PARENT_OF" },
      { fromPersonId: "E", toPersonId: "F", type: "PARENT_OF" },
      { fromPersonId: "J", toPersonId: "E", type: "PARENT_OF" },
      { fromPersonId: "K", toPersonId: "E", type: "PARENT_OF" },
      { fromPersonId: "D", toPersonId: "G", type: "SPOUSE_OF" },
      { fromPersonId: "D", toPersonId: "H", type: "PARENT_OF" },
      { fromPersonId: "G", toPersonId: "H", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, {});
    const yOf = (id: string) => positions.get(id)?.[1] ?? 0;

    // D (biological child of A+B) must sit strictly below A and B.
    expect(yOf("D") < yOf("A")).toBe(true);
    expect(yOf("D") < yOf("B")).toBe(true);

    // G married into D's family and should share D's row (not J/K's grandparent row).
    expect(yOf("G")).toBeCloseTo(yOf("D"));

    // Both sibling branches (C+E and D+G) should be on the same row.
    expect(yOf("C")).toBeCloseTo(yOf("D"));
    expect(yOf("E")).toBeCloseTo(yOf("C"));

    // Grandchildren F and H should share a row, both below their parents.
    expect(yOf("H")).toBeCloseTo(yOf("F"));
    expect(yOf("H") < yOf("D")).toBe(true);
    expect(yOf("H") < yOf("G")).toBe(true);
  });

  it("rotates the smaller spouse family perpendicular into the Z axis", () => {
    // Big side: A has parents (pa1, pa2), grandparents (gpa1..gpa4), and a sibling.
    // Small side: B has a single parent (pb1).
    const people: ImmichPerson[] = [
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
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "A", toPersonId: "B", type: "SPOUSE_OF" },
      { fromPersonId: "pa1", toPersonId: "A", type: "PARENT_OF" },
      { fromPersonId: "pa2", toPersonId: "A", type: "PARENT_OF" },
      { fromPersonId: "pa1", toPersonId: "sibA", type: "PARENT_OF" },
      { fromPersonId: "pa2", toPersonId: "sibA", type: "PARENT_OF" },
      { fromPersonId: "gpa1", toPersonId: "pa1", type: "PARENT_OF" },
      { fromPersonId: "gpa2", toPersonId: "pa1", type: "PARENT_OF" },
      { fromPersonId: "gpa3", toPersonId: "pa2", type: "PARENT_OF" },
      { fromPersonId: "gpa4", toPersonId: "pa2", type: "PARENT_OF" },
      { fromPersonId: "pb1", toPersonId: "B", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, {});
    const zOf = (id: string) => positions.get(id)?.[2] ?? 0;

    // pb1 and pa1/pa2 are all grandparent-depth, so they share the same staircase
    // Z offset. After rotation, pb1 should sit far off the main plane that
    // pa1/pa2 occupy.
    const mainPlaneZ = (zOf("pa1") + zOf("pa2")) / 2;
    expect(Math.abs(zOf("pb1") - mainPlaneZ)).toBeGreaterThan(1.5);

    // The major family's members should stay clustered on the same Z plane.
    expect(Math.abs(zOf("pa1") - zOf("pa2"))).toBeLessThan(0.6);
    expect(Math.abs(zOf("sibA") - zOf("A"))).toBeLessThan(0.6);
  });

  it("still rotates the smaller spouse family when the couple has shared children", () => {
    // A (big family: brother + 2 parents + 4 grandparents) married to B
    // (small family: 1 sister + 2 parents). The couple also shares two kids
    // (c1, c2). Before the fix, kids showed up in both sides' BFS and the
    // overlap check aborted the rotation.
    const people: ImmichPerson[] = [
      { id: "A", name: "A Main" },
      { id: "B", name: "B Spouse" },
      { id: "broA", name: "Brother A" },
      { id: "pa1", name: "Parent A1" },
      { id: "pa2", name: "Parent A2" },
      { id: "gpa1", name: "Grand A1" },
      { id: "gpa2", name: "Grand A2" },
      { id: "gpa3", name: "Grand A3" },
      { id: "gpa4", name: "Grand A4" },
      { id: "sisB", name: "Sister B" },
      { id: "pb1", name: "Parent B1" },
      { id: "pb2", name: "Parent B2" },
      { id: "c1", name: "Child 1" },
      { id: "c2", name: "Child 2" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "A", toPersonId: "B", type: "SPOUSE_OF" },
      { fromPersonId: "pa1", toPersonId: "A", type: "PARENT_OF" },
      { fromPersonId: "pa2", toPersonId: "A", type: "PARENT_OF" },
      { fromPersonId: "pa1", toPersonId: "broA", type: "PARENT_OF" },
      { fromPersonId: "pa2", toPersonId: "broA", type: "PARENT_OF" },
      { fromPersonId: "gpa1", toPersonId: "pa1", type: "PARENT_OF" },
      { fromPersonId: "gpa2", toPersonId: "pa1", type: "PARENT_OF" },
      { fromPersonId: "gpa3", toPersonId: "pa2", type: "PARENT_OF" },
      { fromPersonId: "gpa4", toPersonId: "pa2", type: "PARENT_OF" },
      { fromPersonId: "pb1", toPersonId: "B", type: "PARENT_OF" },
      { fromPersonId: "pb2", toPersonId: "B", type: "PARENT_OF" },
      { fromPersonId: "pb1", toPersonId: "sisB", type: "PARENT_OF" },
      { fromPersonId: "pb2", toPersonId: "sisB", type: "PARENT_OF" },
      { fromPersonId: "A", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "B", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "A", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "B", toPersonId: "c2", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, {});
    const zOf = (id: string) => positions.get(id)?.[2] ?? 0;

    // Parent-generation comparison: pb1/pb2 (minor side) vs pa1/pa2 (major side),
    // all at the same depth so the staircase offset cancels out.
    const majorParentZ = (zOf("pa1") + zOf("pa2")) / 2;
    expect(Math.abs(zOf("pb1") - majorParentZ)).toBeGreaterThan(1.5);
    expect(Math.abs(zOf("pb2") - majorParentZ)).toBeGreaterThan(1.5);
    expect(Math.abs(zOf("sisB") - zOf("B"))).toBeGreaterThan(1.5);

    // Major family stays clustered together.
    expect(Math.abs(zOf("pa1") - zOf("pa2"))).toBeLessThan(0.6);
    expect(Math.abs(zOf("broA") - zOf("A"))).toBeLessThan(0.6);

    // Shared children of the couple must NOT be rotated — they belong to both
    // sides and should remain under the couple on the main plane.
    expect(Math.abs(zOf("c1") - zOf("c2"))).toBeLessThan(0.6);
    const coupleZ = (zOf("A") + zOf("B")) / 2;
    expect(Math.abs(zOf("c1") - coupleZ)).toBeLessThan(1.5);
  });

  it("leaves symmetric spouse families on the main Z plane", () => {
    const people: ImmichPerson[] = [
      { id: "A", name: "A Main" },
      { id: "B", name: "B Spouse" },
      { id: "pa1", name: "Parent A1" },
      { id: "pa2", name: "Parent A2" },
      { id: "pb1", name: "Parent B1" },
      { id: "pb2", name: "Parent B2" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "A", toPersonId: "B", type: "SPOUSE_OF" },
      { fromPersonId: "pa1", toPersonId: "A", type: "PARENT_OF" },
      { fromPersonId: "pa2", toPersonId: "A", type: "PARENT_OF" },
      { fromPersonId: "pb1", toPersonId: "B", type: "PARENT_OF" },
      { fromPersonId: "pb2", toPersonId: "B", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, {});
    const zOf = (id: string) => positions.get(id)?.[2] ?? 0;
    // All four parents are at the same depth, so with no rotation they should
    // share the same Z (any per-depth staircase offset is identical for them).
    for (const id of ["pa1", "pa2", "pb2"]) {
      expect(Math.abs(zOf(id) - zOf("pb1"))).toBeLessThan(0.6);
    }
  });

  it("keeps children below both parents in multi-sister spouse branches", () => {
    const people: ImmichPerson[] = [
      { id: "gp1", name: "Grand Parent 1" },
      { id: "gp2", name: "Grand Parent 2" },
      { id: "s1", name: "Sister 1" },
      { id: "s2", name: "Sister 2" },
      { id: "s3", name: "Sister 3" },
      { id: "sp1", name: "Spouse 1" },
      { id: "sp2", name: "Spouse 2" },
      { id: "c1", name: "Child 1" },
      { id: "c2", name: "Child 2" }
    ];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "gp1", toPersonId: "s1", type: "PARENT_OF" },
      { fromPersonId: "gp2", toPersonId: "s1", type: "PARENT_OF" },
      { fromPersonId: "gp1", toPersonId: "s2", type: "PARENT_OF" },
      { fromPersonId: "gp2", toPersonId: "s2", type: "PARENT_OF" },
      { fromPersonId: "gp1", toPersonId: "s3", type: "PARENT_OF" },
      { fromPersonId: "gp2", toPersonId: "s3", type: "PARENT_OF" },
      { fromPersonId: "s1", toPersonId: "sp1", type: "SPOUSE_OF" },
      { fromPersonId: "s2", toPersonId: "sp2", type: "SPOUSE_OF" },
      { fromPersonId: "s1", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "sp1", toPersonId: "c1", type: "PARENT_OF" },
      { fromPersonId: "s2", toPersonId: "c2", type: "PARENT_OF" },
      { fromPersonId: "sp2", toPersonId: "c2", type: "PARENT_OF" }
    ];

    const positions = getPositionById(people, relationships, {});
    const s1 = positions.get("s1");
    const sp1 = positions.get("sp1");
    const c1 = positions.get("c1");
    const s2 = positions.get("s2");
    const sp2 = positions.get("sp2");
    const c2 = positions.get("c2");

    expect(s1).toBeDefined();
    expect(sp1).toBeDefined();
    expect(c1).toBeDefined();
    expect(s2).toBeDefined();
    expect(sp2).toBeDefined();
    expect(c2).toBeDefined();

    expect((c1?.[1] ?? 0) < (s1?.[1] ?? 0)).toBe(true);
    expect((c1?.[1] ?? 0) < (sp1?.[1] ?? 0)).toBe(true);
    expect((c2?.[1] ?? 0) < (s2?.[1] ?? 0)).toBe(true);
    expect((c2?.[1] ?? 0) < (sp2?.[1] ?? 0)).toBe(true);
  });

  it("lays out many disconnected families within a reasonable time budget", () => {
    // The component-separation pass used to be O(C⁴·V), which was the real
    // profiler hotspot on graphs with many small disconnected families. This
    // test builds a forest of such families and asserts that the whole layout
    // completes well under a second.
    const people: ImmichPerson[] = [];
    const relationships: RelationshipRecord[] = [];
    const familyCount = 60;
    const childrenPerFamily = 3;

    for (let familyIndex = 0; familyIndex < familyCount; familyIndex += 1) {
      const momId = `fam${familyIndex}_mom`;
      const dadId = `fam${familyIndex}_dad`;
      people.push({ id: momId, name: momId }, { id: dadId, name: dadId });
      relationships.push({ fromPersonId: momId, toPersonId: dadId, type: "SPOUSE_OF" });
      for (let childIndex = 0; childIndex < childrenPerFamily; childIndex += 1) {
        const childId = `fam${familyIndex}_child${childIndex}`;
        people.push({ id: childId, name: childId });
        relationships.push({ fromPersonId: momId, toPersonId: childId, type: "PARENT_OF" });
        relationships.push({ fromPersonId: dadId, toPersonId: childId, type: "PARENT_OF" });
      }
    }

    expect(people.length).toBe(familyCount * (2 + childrenPerFamily));

    const start = performance.now();
    const positioned = positionPeople(people, relationships, {});
    const elapsed = performance.now() - start;

    expect(positioned).toHaveLength(people.length);
    expect(elapsed).toBeLessThan(500);
  });

  it("lays out a large multi-generation family within a reasonable time budget", () => {
    // Synthetic 6-generation family with siblings, spouses-with-their-own-parents,
    // and grandchildren. Exercises the perpendicular minor-spouse pass at scale
    // so we catch any future O(P·V) regression.
    const people: ImmichPerson[] = [];
    const relationships: RelationshipRecord[] = [];
    const generations: string[][] = [];
    const siblingsPerCouple = 3;
    const totalGenerations = 6;

    let personCounter = 0;
    const mintPerson = (label: string) => {
      const id = `p${personCounter++}_${label}`;
      people.push({ id, name: id });
      return id;
    };

    // Generation 0: 2 founders (a couple).
    const founderA = mintPerson("g0a");
    const founderB = mintPerson("g0b");
    relationships.push({ fromPersonId: founderA, toPersonId: founderB, type: "SPOUSE_OF" });
    generations.push([founderA, founderB]);

    for (let gen = 1; gen < totalGenerations; gen += 1) {
      const previousCouples: Array<[string, string]> = [];
      const previous = generations[gen - 1] ?? [];
      for (let index = 0; index < previous.length; index += 2) {
        const left = previous[index];
        const right = previous[index + 1];
        if (left && right) {
          previousCouples.push([left, right]);
        }
      }

      const nextGenIds: string[] = [];
      for (const [parentLeft, parentRight] of previousCouples) {
        for (let childIndex = 0; childIndex < siblingsPerCouple; childIndex += 1) {
          const child = mintPerson(`g${gen}c${childIndex}`);
          relationships.push({ fromPersonId: parentLeft, toPersonId: child, type: "PARENT_OF" });
          relationships.push({ fromPersonId: parentRight, toPersonId: child, type: "PARENT_OF" });

          // Give each child an "in-married" spouse with their own 2 parents —
          // the smaller side that the perpendicular pass should rotate.
          if (gen < totalGenerations - 1) {
            const spouse = mintPerson(`g${gen}s${childIndex}`);
            const spouseParent1 = mintPerson(`g${gen}sp1_${childIndex}`);
            const spouseParent2 = mintPerson(`g${gen}sp2_${childIndex}`);
            relationships.push({ fromPersonId: child, toPersonId: spouse, type: "SPOUSE_OF" });
            relationships.push({ fromPersonId: spouseParent1, toPersonId: spouse, type: "PARENT_OF" });
            relationships.push({ fromPersonId: spouseParent2, toPersonId: spouse, type: "PARENT_OF" });
            relationships.push({
              fromPersonId: spouseParent1,
              toPersonId: spouseParent2,
              type: "SPOUSE_OF"
            });
            nextGenIds.push(child, spouse);
          } else {
            nextGenIds.push(child);
          }
        }
      }
      generations.push(nextGenIds);
    }

    expect(people.length).toBeGreaterThan(150);

    const start = performance.now();
    const positioned = positionPeople(people, relationships, {});
    const elapsed = performance.now() - start;

    expect(positioned).toHaveLength(people.length);
    expect(elapsed).toBeLessThan(750);
  });
});

describe("layout edge cases", () => {
  it("does not complete layout for a two-node parent-child cycle (Buchheim recursion)", () => {
    const people: ImmichPerson[] = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const relationships: RelationshipRecord[] = [
      { fromPersonId: "a", toPersonId: "b", type: "PARENT_OF" },
      { fromPersonId: "b", toPersonId: "a", type: "PARENT_OF" }
    ];
    expect(() => positionPeople(people, relationships, {})).toThrow(RangeError);
  });

  it("does not change family positions when only non-topology edges differ", () => {
    const people: ImmichPerson[] = [
      { id: "p1", name: "Pat One" },
      { id: "p2", name: "Pat Two" }
    ];
    const topology: RelationshipRecord[] = [{ fromPersonId: "p1", toPersonId: "p2", type: "SPOUSE_OF" }];
    const withFriend: RelationshipRecord[] = [
      ...topology,
      { fromPersonId: "p1", toPersonId: "p2", type: "FRIEND_OF" }
    ];
    const a = getPositionById(people, topology);
    const b = getPositionById(people, withFriend);
    expect(a.get("p1")).toEqual(b.get("p1"));
    expect(a.get("p2")).toEqual(b.get("p2"));
  });
});

describe("buildGraphLayoutRevision", () => {
  const baseRequest = (): GraphLayoutRequest => ({
    people: [
      { id: "a", name: "A" },
      { id: "x", name: "X" }
    ],
    relationships: [],
    viewMode: "family",
    familyViewStyle: "generationTree",
    selectedPersonId: null,
    primaryFamilyUnitByPersonId: {}
  });

  it("ignores non-topology edges in the relationship hash when people are identical", () => {
    const withoutExtra = baseRequest();
    const withFriend: GraphLayoutRequest = {
      ...baseRequest(),
      relationships: [{ fromPersonId: "a", toPersonId: "x", type: "FRIEND_OF" }]
    };
    expect(buildGraphLayoutRevision(withoutExtra)).toBe(buildGraphLayoutRevision(withFriend));
  });
});
