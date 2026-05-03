import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person } from "../../lib/api";
import { type NodePosition } from "./layout";
import {
  getCameraNudgeForDirection,
  getNextKeyboardTraversal,
  resolveKeyboardDirection
} from "./useGraphKeyboardNavigation";
import { getFocusCameraPose } from "./graphCameraPoses";
import { findPersonBySearchTerm, resolveFocusPersonRequest } from "./useGraphSearch";
import {
  resolveNodeRenderTier,
  shouldRenderDetailedNode,
  shouldRenderInstancedVisualForNode,
  shouldShowNodeLabel,
  shouldUseLargeGraphTier
} from "./scene/graphRenderTiers";
import { shouldSkipNodeAnimationFrame } from "./scene/nodeAnimationPolicy";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("useGraphSearch helpers", () => {
  it("resolves focus request by person id", () => {
    const people: Person[] = [
      { id: "mike-id", name: "Mike", hasRelationship: false },
      { id: "anna-id", name: "Anna", hasRelationship: false }
    ];

    expect(resolveFocusPersonRequest(people, "anna-id")?.id).toBe("anna-id");
    expect(resolveFocusPersonRequest(people, "missing")).toBeNull();
  });

  it("finds matching person by search term", () => {
    const people: Person[] = [
      { id: "mike-id", name: "Mike Jordan", hasRelationship: false },
      { id: "anna-id", name: "Anna", hasRelationship: false }
    ];

    expect(findPersonBySearchTerm(people, "mike")?.id).toBe("mike-id");
    expect(findPersonBySearchTerm(people, "  ")).toBeNull();
    expect(findPersonBySearchTerm(people, "not-found")).toBeNull();
  });

  it("finds person by Immich external identity display name when Treemich display label differs", () => {
    const people: Person[] = [
      {
        id: "treemich-id",
        name: "Jane Doe",
        displayName: "Jane D.",
        hasRelationship: false,
        externalIdentities: [
          {
            id: "ext-1",
            personId: "treemich-id",
            provider: "IMMICH",
            providerPersonId: "im-1",
            providerBaseUrl: "https://immich.test/api",
            displayName: "Vacation Emma",
            thumbnailImportedAt: null,
            lastSeenAt: null,
            metadata: {},
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      }
    ];

    expect(findPersonBySearchTerm(people, "emma")?.id).toBe("treemich-id");
    expect(findPersonBySearchTerm(people, "vacation")?.id).toBe("treemich-id");
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
    const peopleById = new Map<string, Person>([
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
    const peopleById = new Map<string, Person>([
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
    const peopleById = new Map<string, Person>([
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

  it("keeps loaded thumbnails in the thumbnail tier during large-graph LOD", () => {
    expect(
      resolveNodeRenderTier({
        largeGraphTierEnabled: true,
        isPriorityNode: false,
        visibilityBucket: "near",
        hasThumbnail: true
      })
    ).toBe("thumbnail");
  });

  it("keeps labels visible for near minimal-tier nodes in large GEDCOM graphs", () => {
    expect(
      resolveNodeRenderTier({
        largeGraphTierEnabled: true,
        isPriorityNode: false,
        visibilityBucket: "near",
        hasThumbnail: false
      })
    ).toBe("minimal");
    expect(shouldShowNodeLabel({ visibilityBucket: "near", isPriorityNode: false })).toBe(true);
  });

  it("does not render the instanced fallback disk behind loaded thumbnails", () => {
    expect(shouldRenderInstancedVisualForNode({ hasThumbnail: true })).toBe(false);
    expect(shouldRenderInstancedVisualForNode({ hasThumbnail: false })).toBe(true);
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
