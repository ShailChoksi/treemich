import { useEffect, useMemo, useRef } from "react";
import type { ImmichPerson, RelationshipRecord } from "../../lib/api";
import {
  buildDirectionalNeighborBuckets,
  type DirectionalNeighborBuckets,
  type NodePosition
} from "./layout";

export type KeyboardDirection = "up" | "down" | "left" | "right";

type TraversalCycleState = {
  signature: string;
  index: number;
};

type UseGraphKeyboardNavigationOptions = {
  enabled: boolean;
  selectedPersonId: string | null;
  relationships: RelationshipRecord[];
  visiblePositionsById: Map<string, NodePosition>;
  peopleById: Map<string, ImmichPerson>;
  setSelectedPersonId: (personId: string | null) => void;
  setFocusPersonId: (personId: string | null) => void;
  setPinnedPersonId: (personId: string | null) => void;
  nudgeCamera: (forwardUnits: number, rightUnits: number) => void;
};

type NextTraversalOptions = {
  selectedPersonId: string;
  direction: KeyboardDirection;
  buckets: DirectionalNeighborBuckets;
  visiblePositionsById: Map<string, NodePosition>;
  peopleById: Map<string, ImmichPerson>;
  previousCycle: TraversalCycleState | null;
};

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable)
  );
};

const getPersonName = (peopleById: Map<string, ImmichPerson>, personId: string) =>
  peopleById.get(personId)?.name ?? personId;

const getDirectionalPositionScore = (
  personId: string,
  direction: KeyboardDirection,
  anchorPosition: NodePosition | undefined,
  visiblePositionsById: Map<string, NodePosition>
) => {
  const fallback = Number.POSITIVE_INFINITY;
  const position = visiblePositionsById.get(personId);
  if (!position || !anchorPosition) {
    return [fallback, fallback, fallback] as const;
  }

  const [anchorX, anchorY, anchorZ] = anchorPosition;
  const [x, y, z] = position;

  if (direction === "up") {
    return [-y, Math.abs(x - anchorX), Math.abs(z - anchorZ)] as const;
  }
  if (direction === "down") {
    return [y, Math.abs(x - anchorX), Math.abs(z - anchorZ)] as const;
  }
  if (direction === "left") {
    return [x, Math.abs(y - anchorY), Math.abs(z - anchorZ)] as const;
  }
  return [-x, Math.abs(y - anchorY), Math.abs(z - anchorZ)] as const;
};

const compareTuple = (left: readonly number[], right: readonly number[]) => {
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }
  return 0;
};

const sortDirectionalCandidates = (
  candidateIds: string[],
  direction: KeyboardDirection,
  selectedPersonId: string,
  visiblePositionsById: Map<string, NodePosition>,
  peopleById: Map<string, ImmichPerson>
) => {
  const uniqueCandidateIds = [
    ...new Set(candidateIds.filter((candidateId) => candidateId !== selectedPersonId))
  ];
  const anchorPosition = visiblePositionsById.get(selectedPersonId);

  return uniqueCandidateIds.sort((left, right) => {
    const leftScore = getDirectionalPositionScore(left, direction, anchorPosition, visiblePositionsById);
    const rightScore = getDirectionalPositionScore(right, direction, anchorPosition, visiblePositionsById);
    const scoreComparison = compareTuple(leftScore, rightScore);
    if (scoreComparison !== 0) {
      return scoreComparison;
    }

    const nameComparison = getPersonName(peopleById, left).localeCompare(getPersonName(peopleById, right));
    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.localeCompare(right);
  });
};

export const resolveKeyboardDirection = (eventCode: string): KeyboardDirection | null => {
  if (eventCode === "ArrowUp" || eventCode === "KeyW") {
    return "up";
  }
  if (eventCode === "ArrowDown" || eventCode === "KeyS") {
    return "down";
  }
  if (eventCode === "ArrowLeft" || eventCode === "KeyA") {
    return "left";
  }
  if (eventCode === "ArrowRight" || eventCode === "KeyD") {
    return "right";
  }
  return null;
};

export const getCameraNudgeForDirection = (
  direction: KeyboardDirection
): { forwardUnits: number; rightUnits: number } => {
  if (direction === "up") {
    return { forwardUnits: 1, rightUnits: 0 };
  }
  if (direction === "down") {
    return { forwardUnits: -1, rightUnits: 0 };
  }
  if (direction === "left") {
    return { forwardUnits: 0, rightUnits: -1 };
  }
  return { forwardUnits: 0, rightUnits: 1 };
};

export const getNextKeyboardTraversal = ({
  selectedPersonId,
  direction,
  buckets,
  visiblePositionsById,
  peopleById,
  previousCycle
}: NextTraversalOptions): { nextPersonId: string | null; nextCycle: TraversalCycleState | null } => {
  const bucketCandidates =
    direction === "up" ? buckets.up : direction === "down" ? buckets.down : buckets.side;
  const orderedCandidates = sortDirectionalCandidates(
    bucketCandidates,
    direction,
    selectedPersonId,
    visiblePositionsById,
    peopleById
  );

  if (orderedCandidates.length === 0) {
    return { nextPersonId: null, nextCycle: null };
  }

  const signature = `${selectedPersonId}:${direction}:${orderedCandidates.join("|")}`;
  const nextIndex =
    previousCycle && previousCycle.signature === signature
      ? (previousCycle.index + 1) % orderedCandidates.length
      : 0;

  return {
    nextPersonId: orderedCandidates[nextIndex] ?? null,
    nextCycle: { signature, index: nextIndex }
  };
};

export const useGraphKeyboardNavigation = ({
  enabled,
  selectedPersonId,
  relationships,
  visiblePositionsById,
  peopleById,
  setSelectedPersonId,
  setFocusPersonId,
  setPinnedPersonId,
  nudgeCamera
}: UseGraphKeyboardNavigationOptions) => {
  const cycleStateRef = useRef<TraversalCycleState | null>(null);
  const directionalBuckets = useMemo(
    () =>
      selectedPersonId
        ? buildDirectionalNeighborBuckets(selectedPersonId, relationships)
        : { up: [], down: [], side: [] },
    [relationships, selectedPersonId]
  );

  useEffect(() => {
    cycleStateRef.current = null;
  }, [selectedPersonId, directionalBuckets]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabled || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }

      const direction = resolveKeyboardDirection(event.code);
      if (!direction) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!selectedPersonId) {
        cycleStateRef.current = null;
        const nudge = getCameraNudgeForDirection(direction);
        nudgeCamera(nudge.forwardUnits, nudge.rightUnits);
        return;
      }

      const { nextPersonId, nextCycle } = getNextKeyboardTraversal({
        selectedPersonId,
        direction,
        buckets: directionalBuckets,
        visiblePositionsById,
        peopleById,
        previousCycle: cycleStateRef.current
      });
      cycleStateRef.current = nextCycle;

      if (!nextPersonId) {
        return;
      }

      setSelectedPersonId(nextPersonId);
      setFocusPersonId(nextPersonId);
      setPinnedPersonId(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    directionalBuckets,
    enabled,
    nudgeCamera,
    peopleById,
    selectedPersonId,
    setFocusPersonId,
    setPinnedPersonId,
    setSelectedPersonId,
    visiblePositionsById
  ]);
};
