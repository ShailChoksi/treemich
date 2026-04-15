import { describe, expect, it } from "vitest";
import type { ImmichPerson, RelationshipRecord } from "../../lib/api";
import { buildParentChildIndex, getLastNameKey, hashToNumber, positionPeople } from "./layout";

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
    const uniqueXY = new Set(children.map((position) => `${position[0].toFixed(3)}|${position[1].toFixed(3)}`));
    expect(uniqueXY.size).toBe(children.length);
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
