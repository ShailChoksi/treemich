import { describe, expect, it } from "vitest";
import type { ImmichPerson } from "../../lib/api";
import { type NodePosition } from "./layout";
import { filterRelationshipsByLayer, pickNearest } from "./useGraphLayoutState";
import {
  getCameraNudgeForDirection,
  getNextKeyboardTraversal,
  resolveKeyboardDirection
} from "./useGraphKeyboardNavigation";
import { findPersonBySearchTerm, resolveFocusPersonRequest } from "./useGraphSearch";

describe("pickNearest", () => {
  it("returns nearest people to origin up to limit", () => {
    const items = [
      { person: { id: "a", name: "A" } as ImmichPerson, position: [10, 0, 0] as NodePosition },
      { person: { id: "b", name: "B" } as ImmichPerson, position: [2, 0, 0] as NodePosition },
      { person: { id: "c", name: "C" } as ImmichPerson, position: [1, 0, 0] as NodePosition }
    ];

    const nearest = pickNearest(items, [0, 0, 0], 2);
    expect(nearest.map((item) => item.person.id)).toEqual(["c", "b"]);
  });
});

describe("filterRelationshipsByLayer", () => {
  it("keeps only relationship types from enabled layers", () => {
    const filtered = filterRelationshipsByLayer(
      [
        { fromPersonId: "a", toPersonId: "b", type: "PARENT_OF" },
        { fromPersonId: "a", toPersonId: "c", type: "FRIEND_OF" },
        { fromPersonId: "a", toPersonId: "d", type: "PET_OF" }
      ],
      {
        parentChild: true,
        spouse: false,
        sibling: false,
        friends: false,
        pets: true
      }
    );

    expect(filtered).toEqual([
      { fromPersonId: "a", toPersonId: "b", type: "PARENT_OF" },
      { fromPersonId: "a", toPersonId: "d", type: "PET_OF" }
    ]);
  });
});

describe("useGraphSearch helpers", () => {
  it("resolves focus request by person id", () => {
    const people: ImmichPerson[] = [
      { id: "mike-id", name: "Mike", hasRelationship: false },
      { id: "anna-id", name: "Anna", hasRelationship: false }
    ];

    expect(resolveFocusPersonRequest(people, "anna-id")?.id).toBe("anna-id");
    expect(resolveFocusPersonRequest(people, "missing")).toBeNull();
  });

  it("finds matching person by search term", () => {
    const people: ImmichPerson[] = [
      { id: "mike-id", name: "Mike Jordan", hasRelationship: false },
      { id: "anna-id", name: "Anna", hasRelationship: false }
    ];

    expect(findPersonBySearchTerm(people, "mike")?.id).toBe("mike-id");
    expect(findPersonBySearchTerm(people, "  ")).toBeNull();
    expect(findPersonBySearchTerm(people, "not-found")).toBeNull();
  });
});

describe("useGraphKeyboardNavigation helpers", () => {
  it("maps arrow and WASD key codes to directions", () => {
    expect(resolveKeyboardDirection("ArrowUp")).toBe("up");
    expect(resolveKeyboardDirection("KeyW")).toBe("up");
    expect(resolveKeyboardDirection("ArrowDown")).toBe("down");
    expect(resolveKeyboardDirection("KeyS")).toBe("down");
    expect(resolveKeyboardDirection("ArrowLeft")).toBe("left");
    expect(resolveKeyboardDirection("KeyA")).toBe("left");
    expect(resolveKeyboardDirection("ArrowRight")).toBe("right");
    expect(resolveKeyboardDirection("KeyD")).toBe("right");
    expect(resolveKeyboardDirection("Space")).toBeNull();
  });

  it("maps directions to camera nudge vectors for no-selection mode", () => {
    expect(getCameraNudgeForDirection("up")).toEqual({ forwardUnits: 1, rightUnits: 0 });
    expect(getCameraNudgeForDirection("down")).toEqual({ forwardUnits: -1, rightUnits: 0 });
    expect(getCameraNudgeForDirection("left")).toEqual({ forwardUnits: 0, rightUnits: -1 });
    expect(getCameraNudgeForDirection("right")).toEqual({ forwardUnits: 0, rightUnits: 1 });
  });

  it("cycles through side candidates on repeated key presses", () => {
    const peopleById = new Map<string, ImmichPerson>([
      ["self", { id: "self", name: "Self", hasRelationship: false }],
      ["leftA", { id: "leftA", name: "Alice", hasRelationship: false }],
      ["leftB", { id: "leftB", name: "Bob", hasRelationship: false }],
      ["right", { id: "right", name: "Zoey", hasRelationship: false }]
    ]);
    const visiblePositionsById = new Map<string, NodePosition>([
      ["self", [0, 0, 0]],
      ["leftA", [-6, 0.2, 0]],
      ["leftB", [-2, 0.1, 0]],
      ["right", [7, 0.1, 0]]
    ]);
    const buckets = {
      up: [],
      down: [],
      side: ["leftA", "right", "leftB"]
    };

    const first = getNextKeyboardTraversal({
      selectedPersonId: "self",
      direction: "left",
      buckets,
      visiblePositionsById,
      peopleById,
      previousCycle: null
    });
    expect(first.nextPersonId).toBe("leftA");

    const second = getNextKeyboardTraversal({
      selectedPersonId: "self",
      direction: "left",
      buckets,
      visiblePositionsById,
      peopleById,
      previousCycle: first.nextCycle
    });
    expect(second.nextPersonId).toBe("leftB");

    const third = getNextKeyboardTraversal({
      selectedPersonId: "self",
      direction: "left",
      buckets,
      visiblePositionsById,
      peopleById,
      previousCycle: second.nextCycle
    });
    expect(third.nextPersonId).toBe("right");
  });

  it("resets cycle when direction changes", () => {
    const peopleById = new Map<string, ImmichPerson>([
      ["self", { id: "self", name: "Self", hasRelationship: false }],
      ["topA", { id: "topA", name: "Alpha Parent", hasRelationship: false }],
      ["topB", { id: "topB", name: "Beta Parent", hasRelationship: false }]
    ]);
    const visiblePositionsById = new Map<string, NodePosition>([
      ["self", [0, 0, 0]],
      ["topA", [0, 8, 0]],
      ["topB", [1, 6, 0]]
    ]);
    const buckets = {
      up: ["topB", "topA"],
      down: [],
      side: []
    };

    const firstUp = getNextKeyboardTraversal({
      selectedPersonId: "self",
      direction: "up",
      buckets,
      visiblePositionsById,
      peopleById,
      previousCycle: null
    });
    const secondUp = getNextKeyboardTraversal({
      selectedPersonId: "self",
      direction: "up",
      buckets,
      visiblePositionsById,
      peopleById,
      previousCycle: firstUp.nextCycle
    });
    const firstDown = getNextKeyboardTraversal({
      selectedPersonId: "self",
      direction: "down",
      buckets,
      visiblePositionsById,
      peopleById,
      previousCycle: secondUp.nextCycle
    });

    expect(firstUp.nextPersonId).toBe("topA");
    expect(secondUp.nextPersonId).toBe("topB");
    expect(firstDown.nextPersonId).toBeNull();
  });

  it("resets cycle when candidate set changes", () => {
    const peopleById = new Map<string, ImmichPerson>([
      ["self", { id: "self", name: "Self", hasRelationship: false }],
      ["sideA", { id: "sideA", name: "Alpha", hasRelationship: false }],
      ["sideB", { id: "sideB", name: "Bravo", hasRelationship: false }]
    ]);
    const visiblePositionsById = new Map<string, NodePosition>([
      ["self", [0, 0, 0]],
      ["sideA", [-4, 0, 0]],
      ["sideB", [-2, 0, 0]]
    ]);

    const first = getNextKeyboardTraversal({
      selectedPersonId: "self",
      direction: "left",
      buckets: { up: [], down: [], side: ["sideA", "sideB"] },
      visiblePositionsById,
      peopleById,
      previousCycle: null
    });
    const changedCandidates = getNextKeyboardTraversal({
      selectedPersonId: "self",
      direction: "left",
      buckets: { up: [], down: [], side: ["sideB"] },
      visiblePositionsById,
      peopleById,
      previousCycle: first.nextCycle
    });

    expect(first.nextPersonId).toBe("sideA");
    expect(changedCandidates.nextPersonId).toBe("sideB");
  });
});
