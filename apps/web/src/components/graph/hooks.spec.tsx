import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGraphLayoutRevision } from "@treemich/shared";
import type { ImmichPerson } from "../../lib/api";
import { type NodePosition } from "./layout";
import * as layout from "./layout";
import * as layoutWorkerClient from "./layoutWorkerClient";
import { defaultGraphFilterVisibility } from "./relationshipStyles";
import { createLayoutStateHookProps } from "./hooksTestFixtures";
import {
  filterRelationshipsByLayer,
  pickNearest,
  pickSingleFamilyTreeIds,
  useGraphLayoutState
} from "./useGraphLayoutState";
import {
  getCameraNudgeForDirection,
  getNextKeyboardTraversal,
  resolveKeyboardDirection
} from "./useGraphKeyboardNavigation";
import { getFocusCameraPose } from "./useGraphCameraControls";
import { findPersonBySearchTerm, resolveFocusPersonRequest } from "./useGraphSearch";
import { shouldRenderDetailedNode, shouldUseLargeGraphTier } from "./scene/AnimatedNodes";
import { shouldSkipNodeAnimationFrame } from "./scene/useAnimatedNodeTransforms";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

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

describe("useGraphLayoutState", () => {
  it("keeps disconnected named faces visible in family view", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let visibleIds: string[] = [];

    const Probe = () => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people: [
            { id: "a", name: "Alpha", hasRelationship: true },
            { id: "b", name: "Beta", hasRelationship: true },
            { id: "c", name: "Charlie", hasRelationship: false }
          ],
          relationships: [{ fromPersonId: "a", toPersonId: "b", type: "SIBLING_OF" }],
          showSingleFamilyTree: true,
          singleFamilyTreeAnchorId: "a",
          selectedPersonId: "a",
          renderLimit: 50
        })
      );
      visibleIds = state.displayVisiblePeople.map((item) => item.person.id).sort();
      return null;
    };

    act(() => {
      root.render(createElement(Probe));
    });

    expect(visibleIds).toEqual(["a", "b", "c"]);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps layout on sync path below worker threshold", () => {
    const workerSpy = vi.spyOn(layoutWorkerClient, "requestPositionPeopleInWorker");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let visibleIds: string[] = [];

    const Probe = () => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people: [
            { id: "a", name: "Alpha", hasRelationship: true },
            { id: "b", name: "Beta", hasRelationship: true }
          ],
          relationships: [{ fromPersonId: "a", toPersonId: "b", type: "SIBLING_OF" }],
          showSingleFamilyTree: true,
          singleFamilyTreeAnchorId: "a",
          selectedPersonId: "a",
          renderLimit: 50
        })
      );
      visibleIds = state.displayVisiblePeople.map((item) => item.person.id).sort();
      return null;
    };

    act(() => {
      root.render(createElement(Probe));
    });

    expect(visibleIds).toEqual(["a", "b"]);
    expect(workerSpy).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("falls back to sync layout when worker request fails", async () => {
    const originalWorker = globalThis.Worker;
    (globalThis as { Worker?: typeof Worker }).Worker = class {} as unknown as typeof Worker;
    const workerSpy = vi
      .spyOn(layoutWorkerClient, "requestPositionPeopleInWorker")
      .mockRejectedValue(new Error("worker unavailable"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let visibleCount = 0;

    const people = Array.from({ length: 340 }, (_, index) => ({
      id: `person-${index}`,
      name: `Person ${index}`,
      hasRelationship: true
    })) as ImmichPerson[];
    const relationships = [{ fromPersonId: "person-0", toPersonId: "person-1", type: "SIBLING_OF" as const }];

    const Probe = () => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people,
          relationships,
          selectedPersonId: "person-0",
          renderLimit: 120
        })
      );
      visibleCount = state.displayVisiblePeople.length;
      return null;
    };

    await act(async () => {
      root.render(createElement(Probe));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(workerSpy).toHaveBeenCalled();
    expect(visibleCount).toBeGreaterThan(0);

    act(() => root.unmount());
    container.remove();
    (globalThis as { Worker?: typeof Worker }).Worker = originalWorker;
  });

  it("ignores stale worker responses from older requests", async () => {
    const originalWorker = globalThis.Worker;
    (globalThis as { Worker?: typeof Worker }).Worker = class {} as unknown as typeof Worker;
    const deferred: Array<{
      resolve: (value: Array<{ personId: string; position: NodePosition }>) => void;
      reject: (reason?: unknown) => void;
    }> = [];
    vi.spyOn(layoutWorkerClient, "requestPositionPeopleInWorker").mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          deferred.push({ resolve, reject });
        })
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let anchorX = 0;

    const basePeople = Array.from({ length: 620 }, (_, index) => ({
      id: index === 0 ? "anchor" : `person-${index}`,
      name: `Person ${index}`,
      hasRelationship: true
    })) as ImmichPerson[];
    const baseRelationships = [
      { fromPersonId: "anchor", toPersonId: "person-1", type: "SIBLING_OF" as const }
    ];

    const Probe = ({ people }: { people: ImmichPerson[] }) => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people,
          relationships: baseRelationships,
          selectedPersonId: "anchor",
          renderLimit: 120
        })
      );
      anchorX = state.visiblePositionsById.get("anchor")?.[0] ?? anchorX;
      return null;
    };

    await act(async () => {
      root.render(createElement(Probe, { people: basePeople }));
      await Promise.resolve();
    });
    const refreshedPeople = [...basePeople];
    await act(async () => {
      root.render(createElement(Probe, { people: refreshedPeople }));
      await Promise.resolve();
    });

    expect(deferred).toHaveLength(2);
    await act(async () => {
      deferred[1]?.resolve([{ personId: "anchor", position: [9, 0, 0] }]);
      await Promise.resolve();
    });
    expect(anchorX).toBe(9);
    await act(async () => {
      deferred[0]?.resolve([{ personId: "anchor", position: [1, 0, 0] }]);
      await Promise.resolve();
    });
    expect(anchorX).toBe(9);

    act(() => root.unmount());
    container.remove();
    (globalThis as { Worker?: typeof Worker }).Worker = originalWorker;
  });

  it("progressively loads visible nodes in renderLimit-sized batches", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let visibleCount = 0;

    const people = Array.from({ length: 280 }, (_, index) => ({
      id: `person-${index}`,
      name: `Person ${index}`,
      hasRelationship: true
    })) as ImmichPerson[];
    const relationships = [{ fromPersonId: "person-0", toPersonId: "person-1", type: "SIBLING_OF" as const }];

    const Probe = () => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people,
          relationships,
          selectedPersonId: "person-0",
          renderLimit: 120
        })
      );
      visibleCount = state.displayVisiblePeople.length;
      return null;
    };

    act(() => {
      root.render(createElement(Probe));
    });
    expect(visibleCount).toBe(120);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(visibleCount).toBe(240);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(visibleCount).toBe(280);

    act(() => root.unmount());
    container.remove();
  });

  it("resets progressive loading to first batch when layout inputs change", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let visibleCount = 0;

    const people = Array.from({ length: 280 }, (_, index) => ({
      id: `person-${index}`,
      name: `Person ${index}`,
      hasRelationship: true
    })) as ImmichPerson[];
    const relationshipsA = [{ fromPersonId: "person-0", toPersonId: "person-1", type: "PARENT_OF" as const }];
    const relationshipsB = [{ fromPersonId: "person-0", toPersonId: "person-2", type: "PARENT_OF" as const }];

    const Probe = ({ relationships }: { relationships: typeof relationshipsA }) => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people,
          relationships,
          selectedPersonId: "person-0",
          renderLimit: 120
        })
      );
      visibleCount = state.displayVisiblePeople.length;
      return null;
    };

    act(() => {
      root.render(createElement(Probe, { relationships: relationshipsA }));
    });
    expect(visibleCount).toBe(120);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(visibleCount).toBe(240);

    act(() => {
      root.render(createElement(Probe, { relationships: relationshipsB }));
    });
    expect(visibleCount).toBe(120);

    act(() => root.unmount());
    container.remove();
  });

  it("keeps selected person visible while progressive batches load", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let visibleIds: string[] = [];

    const people = Array.from({ length: 280 }, (_, index) => ({
      id: `person-${index}`,
      name: `Person ${index}`,
      hasRelationship: true
    })) as ImmichPerson[];
    const relationships = [{ fromPersonId: "person-0", toPersonId: "person-1", type: "SIBLING_OF" as const }];

    const Probe = () => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people,
          relationships,
          selectedPersonId: "person-279",
          renderLimit: 120
        })
      );
      visibleIds = state.displayVisiblePeople.map((item) => item.person.id);
      return null;
    };

    act(() => {
      root.render(createElement(Probe));
    });

    expect(visibleIds).toContain("person-279");
    expect(visibleIds).toHaveLength(120);

    act(() => root.unmount());
    container.remove();
  });

  it("prefers complete server layout and skips worker path", async () => {
    const originalWorker = globalThis.Worker;
    (globalThis as { Worker?: typeof Worker }).Worker = class {} as unknown as typeof Worker;
    const workerSpy = vi.spyOn(layoutWorkerClient, "requestPositionPeopleInWorker");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    const people = Array.from({ length: 610 }, (_, index) => ({
      id: `person-${index}`,
      name: `Person ${index}`,
      hasRelationship: true
    })) as ImmichPerson[];
    const relationships = [{ fromPersonId: "person-0", toPersonId: "person-1", type: "SIBLING_OF" as const }];
    const serverPositionsByPersonId = Object.fromEntries(
      people.map((person, index) => [person.id, [index, 0, 0] as NodePosition])
    );
    const serverLayoutRevision = buildGraphLayoutRevision({
      people: people.map((person) => ({
        id: person.id,
        name: person.name
      })),
      relationships: [],
      viewMode: "family",
      familyViewStyle: "generationTree",
      selectedPersonId: "person-0",
      primaryFamilyUnitByPersonId: {}
    });
    let anchorX = -1;

    const Probe = () => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people,
          relationships,
          selectedPersonId: "person-0",
          serverPositionsByPersonId,
          serverLayoutRevision,
          serverLayoutAlgorithmVersion: "server-hybrid-v1",
          renderLimit: 120
        })
      );
      anchorX = state.visiblePositionsById.get("person-0")?.[0] ?? anchorX;
      return null;
    };

    await act(async () => {
      root.render(createElement(Probe));
      await Promise.resolve();
    });

    expect(workerSpy).not.toHaveBeenCalled();
    expect(anchorX).toBe(0);

    act(() => root.unmount());
    container.remove();
    (globalThis as { Worker?: typeof Worker }).Worker = originalWorker;
  });

  it("reuses topology positions when friend visibility toggles", () => {
    const positionSpy = vi.spyOn(layout, "positionPeople");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const people: ImmichPerson[] = [
      { id: "p1", name: "Alex", hasRelationship: true },
      { id: "p2", name: "Blair", hasRelationship: true },
      { id: "p3", name: "Casey", hasRelationship: true }
    ];
    const relationships = [
      { fromPersonId: "p1", toPersonId: "p2", type: "PARENT_OF" as const },
      { fromPersonId: "p1", toPersonId: "p3", type: "FRIEND_OF" as const }
    ];

    const Probe = ({ friends }: { friends: boolean }) => {
      useGraphLayoutState(
        createLayoutStateHookProps({
          people,
          relationships,
          filterVisibility: {
            ...defaultGraphFilterVisibility,
            friends
          },
          selectedPersonId: "p1",
          renderLimit: 120
        })
      );
      return null;
    };

    act(() => {
      root.render(createElement(Probe, { friends: true }));
    });
    act(() => {
      root.render(createElement(Probe, { friends: false }));
    });

    expect(positionSpy).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });

  it("keeps baseline render-visible nodes even when camera is far", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let renderIds: string[] = [];
    let renderLineCount = 0;

    const people: ImmichPerson[] = [
      { id: "p1", name: "Alex", hasRelationship: true },
      { id: "p2", name: "Blair", hasRelationship: true }
    ];
    const relationships = [{ fromPersonId: "p1", toPersonId: "p2", type: "SIBLING_OF" as const }];

    const Probe = ({ cameraX }: { cameraX: number }) => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people,
          relationships,
          cameraPosition: [cameraX, 0, 0],
          renderLimit: 120
        })
      );
      renderIds = state.renderVisiblePeople.map((item) => item.person.id).sort();
      renderLineCount = state.renderVisibleRelationshipLines.length;
      return null;
    };

    act(() => {
      root.render(createElement(Probe, { cameraX: 0 }));
    });
    expect(renderIds).toEqual(["p1", "p2"]);
    expect(renderLineCount).toBe(1);

    act(() => {
      root.render(createElement(Probe, { cameraX: 260 }));
    });
    expect(renderIds.length).toBeGreaterThan(0);
    expect(renderLineCount).toBe(1);

    act(() => root.unmount());
    container.remove();
  });

  it("reuses render-culling line set for visible line output", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let sameReference = false;

    const Probe = () => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people: [
            { id: "a", name: "Alpha", hasRelationship: true },
            { id: "b", name: "Beta", hasRelationship: true },
            { id: "c", name: "Gamma", hasRelationship: true }
          ],
          relationships: [
            { fromPersonId: "a", toPersonId: "b", type: "SPOUSE_OF" },
            { fromPersonId: "a", toPersonId: "c", type: "PARENT_OF" },
            { fromPersonId: "b", toPersonId: "c", type: "PARENT_OF" }
          ],
          selectedPersonId: "a",
          renderLimit: 120,
          cameraPosition: [300, 0, 0]
        })
      );
      sameReference = state.visibleRelationshipLines === state.renderVisibleRelationshipLines;
      return null;
    };

    act(() => {
      root.render(createElement(Probe));
    });

    expect(sameReference).toBe(true);

    act(() => root.unmount());
    container.remove();
  });

  it("keeps selected node render-visible even when distance bucket culls it", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let renderIds: string[] = [];

    const Probe = () => {
      const state = useGraphLayoutState(
        createLayoutStateHookProps({
          people: [{ id: "selected", name: "Selected", hasRelationship: true }],
          selectedPersonId: "selected",
          cameraPosition: [500, 0, 0],
          renderLimit: 120
        })
      );
      renderIds = state.renderVisiblePeople.map((item) => item.person.id);
      return null;
    };

    act(() => {
      root.render(createElement(Probe));
    });
    expect(renderIds).toEqual(["selected"]);

    act(() => root.unmount());
    container.remove();
  });
});

describe("pickSingleFamilyTreeIds", () => {
  it("returns largest component when no person is selected", () => {
    const ids = pickSingleFamilyTreeIds(
      [
        { fromPersonId: "a", toPersonId: "b", type: "PARENT_OF" },
        { fromPersonId: "b", toPersonId: "c", type: "SPOUSE_OF" },
        { fromPersonId: "x", toPersonId: "y", type: "PARENT_OF" }
      ],
      null
    );

    expect(ids).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns selected person's component when selected", () => {
    const ids = pickSingleFamilyTreeIds(
      [
        { fromPersonId: "a", toPersonId: "b", type: "PARENT_OF" },
        { fromPersonId: "x", toPersonId: "y", type: "PARENT_OF" }
      ],
      "x"
    );

    expect(ids).toEqual(new Set(["x", "y"]));
  });

  it("returns selected person when graph has no relationships", () => {
    const ids = pickSingleFamilyTreeIds([], "solo");
    expect(ids).toEqual(new Set(["solo"]));
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

describe("render-tier helpers", () => {
  it("enables large-graph render tier only above threshold", () => {
    expect(shouldUseLargeGraphTier(100)).toBe(false);
    expect(shouldUseLargeGraphTier(280)).toBe(true);
    expect(shouldUseLargeGraphTier(500)).toBe(true);
  });

  it("keeps detailed rendering for priority nodes in large tier", () => {
    expect(
      shouldRenderDetailedNode({
        largeGraphTierEnabled: false,
        isPriorityNode: false
      })
    ).toBe(true);
    expect(
      shouldRenderDetailedNode({
        largeGraphTierEnabled: true,
        isPriorityNode: true
      })
    ).toBe(true);
    expect(
      shouldRenderDetailedNode({
        largeGraphTierEnabled: true,
        isPriorityNode: false
      })
    ).toBe(false);
    expect(
      shouldRenderDetailedNode({
        largeGraphTierEnabled: false,
        isPriorityNode: false,
        visibilityBucket: "far"
      })
    ).toBe(false);
  });
});

describe("animation loop helpers", () => {
  it("skips non-priority node updates on alternating frames in large-graph mode", () => {
    expect(
      shouldSkipNodeAnimationFrame({
        reduceWorkForLargeGraph: true,
        isPriorityNode: false,
        frameTick: 1
      })
    ).toBe(true);
    expect(
      shouldSkipNodeAnimationFrame({
        reduceWorkForLargeGraph: true,
        isPriorityNode: false,
        frameTick: 2
      })
    ).toBe(false);
    expect(
      shouldSkipNodeAnimationFrame({
        reduceWorkForLargeGraph: true,
        isPriorityNode: true,
        frameTick: 1
      })
    ).toBe(false);
    expect(
      shouldSkipNodeAnimationFrame({
        reduceWorkForLargeGraph: false,
        isPriorityNode: false,
        frameTick: 1
      })
    ).toBe(false);
  });
});

describe("useGraphCameraControls helpers", () => {
  it("builds a focus pose around the target", () => {
    const pose = getFocusCameraPose([10, 4, -3]);
    expect(pose).toEqual({
      position: [10, 7.8, 4.4],
      target: [10, 4, -3]
    });
  });
});
