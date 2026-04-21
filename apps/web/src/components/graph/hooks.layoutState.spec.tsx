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
