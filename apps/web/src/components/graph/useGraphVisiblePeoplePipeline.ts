/**
 * @file Focus offset, progressive cap, pinned-slot search, and axis-aligned bounds for visible graph people.
 */

import { useMemo } from "react";
import { distanceSquared, subtractPosition, type NodePosition } from "./layout";
import { pickNearest } from "./pickNearest";
import type { PositionedPerson } from "./useLayoutOrchestrator";

type DisplayPerson = {
  person: PositionedPerson["person"];
  displayPosition: NodePosition;
};

type UseGraphVisiblePeoplePipelineArgs = {
  positionedPeople: PositionedPerson[];
  positionedById: Map<string, PositionedPerson>;
  effectiveRenderLimit: number;
  selectedPersonId: string | null;
  focusPersonId: string | null;
  pinnedPersonId: string | null;
};

export const useGraphVisiblePeoplePipeline = ({
  positionedPeople,
  positionedById,
  effectiveRenderLimit,
  selectedPersonId,
  focusPersonId,
  pinnedPersonId
}: UseGraphVisiblePeoplePipelineArgs) => {
  const focusPosition = useMemo<NodePosition>(() => {
    const focused = focusPersonId ? positionedById.get(focusPersonId) : undefined;
    return focused?.position ?? [0, 0, 0];
  }, [focusPersonId, positionedById]);

  const candidatePositionedPeople = useMemo(() => positionedPeople, [positionedPeople]);

  const visiblePeople = useMemo(() => {
    const ensurePinnedVisible = (items: typeof positionedPeople) => {
      const ensurePresence = (nextItems: typeof positionedPeople, personId: string | null) => {
        if (!personId) {
          return nextItems;
        }
        const alreadyVisible = nextItems.some((item) => item.person.id === personId);
        if (alreadyVisible) {
          return nextItems;
        }
        const item = positionedById.get(personId);
        if (!item) {
          return nextItems;
        }
        if (nextItems.length === 0) {
          return [item];
        }
        return [item, ...nextItems.slice(0, Math.max(nextItems.length - 1, 0))];
      };

      let nextItems = items;
      nextItems = ensurePresence(nextItems, selectedPersonId);
      nextItems = ensurePresence(nextItems, focusPersonId);
      if (!pinnedPersonId) {
        return nextItems;
      }
      const alreadyVisible = nextItems.some((item) => item.person.id === pinnedPersonId);
      if (alreadyVisible) {
        return nextItems;
      }
      const pinnedItem = positionedById.get(pinnedPersonId);
      if (!pinnedItem) {
        return nextItems;
      }
      if (nextItems.length === 0) {
        return [pinnedItem];
      }
      return [pinnedItem, ...nextItems.slice(0, Math.max(nextItems.length - 1, 0))];
    };

    if (candidatePositionedPeople.length <= effectiveRenderLimit) {
      return ensurePinnedVisible(candidatePositionedPeople);
    }

    if (!focusPersonId) {
      return ensurePinnedVisible(candidatePositionedPeople.slice(0, effectiveRenderLimit));
    }

    const focused = positionedById.get(focusPersonId);
    if (!focused) {
      return ensurePinnedVisible(candidatePositionedPeople.slice(0, effectiveRenderLimit));
    }

    const subset = pickNearest(candidatePositionedPeople, focused.position, effectiveRenderLimit);
    return ensurePinnedVisible(subset);
  }, [
    candidatePositionedPeople,
    effectiveRenderLimit,
    focusPersonId,
    pinnedPersonId,
    positionedById,
    selectedPersonId
  ]);

  const displayVisiblePeople = useMemo(() => {
    const baseItems: DisplayPerson[] = visiblePeople.map((item) => ({
      person: item.person,
      displayPosition: subtractPosition(item.position, focusPosition)
    }));

    if (!pinnedPersonId) {
      return baseItems;
    }

    const pinnedIndex = baseItems.findIndex((item) => item.person.id === pinnedPersonId);
    if (pinnedIndex < 0) {
      return baseItems;
    }

    const otherPositions = baseItems
      .filter((_, index) => index !== pinnedIndex)
      .map((item) => item.displayPosition);

    const minGap = 1.7;
    const minGapSquared = minGap * minGap;
    const candidateOffsets: NodePosition[] = [
      [0, 0, 0],
      [1.9, 0, 0],
      [-1.9, 0, 0],
      [0, 1.6, 0],
      [0, -1.6, 0],
      [2.8, 1.2, 0],
      [-2.8, 1.2, 0],
      [2.8, -1.2, 0],
      [-2.8, -1.2, 0],
      [0, 0, -1.8],
      [2.2, 0, -1.8],
      [-2.2, 0, -1.8]
    ];

    const isOpenSlot = (candidate: NodePosition) =>
      otherPositions.every((position) => distanceSquared(candidate, position) >= minGapSquared);

    const openSlot = candidateOffsets.find(isOpenSlot) ?? ([0, 0, 0] as NodePosition);
    const pinnedItem = baseItems[pinnedIndex];
    if (!pinnedItem) {
      return baseItems;
    }
    const next = [...baseItems];
    next[pinnedIndex] = {
      person: pinnedItem.person,
      displayPosition: openSlot
    };

    return next;
  }, [focusPosition, pinnedPersonId, visiblePeople]);

  const visiblePositionsById = useMemo(
    () => new Map(displayVisiblePeople.map((item) => [item.person.id, item.displayPosition])),
    [displayVisiblePeople]
  );

  const graphBounds = useMemo(() => {
    if (displayVisiblePeople.length === 0) {
      return null;
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const { displayPosition } of displayVisiblePeople) {
      minX = Math.min(minX, displayPosition[0]);
      minY = Math.min(minY, displayPosition[1]);
      minZ = Math.min(minZ, displayPosition[2]);
      maxX = Math.max(maxX, displayPosition[0]);
      maxY = Math.max(maxY, displayPosition[1]);
      maxZ = Math.max(maxZ, displayPosition[2]);
    }

    return {
      min: [minX, minY, minZ] as NodePosition,
      max: [maxX, maxY, maxZ] as NodePosition
    };
  }, [displayVisiblePeople]);

  return {
    displayVisiblePeople,
    graphBounds,
    visiblePositionsById
  };
};
