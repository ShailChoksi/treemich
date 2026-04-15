import { useMemo } from "react";
import type {
  ImmichPerson,
  PhotoCluster,
  PhotoCooccurrenceEdge,
  RelationshipRecord
} from "../../lib/api";
import {
  defaultFamilyViewStyle,
  distanceSquared,
  positionPeople,
  subtractPosition,
  type FamilyViewStyle,
  type GraphLayoutMode,
  type NodePosition
} from "./layout";
import { relationshipKindForType, type RelationshipKind } from "./relationshipStyles";

type UseGraphLayoutStateOptions = {
  people: ImmichPerson[];
  relationships: RelationshipRecord[];
  photoEdges: PhotoCooccurrenceEdge[];
  photoClusters: PhotoCluster[];
  viewMode: GraphLayoutMode;
  familyViewStyle?: FamilyViewStyle;
  selectedPersonId: string | null;
  hoveredPersonId: string | null;
  focusPersonId: string | null;
  pinnedPersonId: string | null;
  renderLimit: number;
};

export const pickNearest = (
  items: Array<{ person: ImmichPerson; position: NodePosition }>,
  origin: NodePosition,
  limit: number
) => {
  if (items.length <= limit) {
    return items;
  }

  const nearest: Array<{ item: { person: ImmichPerson; position: NodePosition }; distance: number }> = [];
  for (const item of items) {
    const candidate = {
      item,
      distance: distanceSquared(item.position, origin)
    };

    if (nearest.length === 0) {
      nearest.push(candidate);
      continue;
    }

    let insertAt = nearest.length;
    while (insertAt > 0 && nearest[insertAt - 1] && nearest[insertAt - 1]!.distance > candidate.distance) {
      insertAt -= 1;
    }

    if (nearest.length < limit) {
      nearest.splice(insertAt, 0, candidate);
      continue;
    }

    const last = nearest[nearest.length - 1];
    if (!last || candidate.distance >= last.distance) {
      continue;
    }

    nearest.splice(insertAt, 0, candidate);
    nearest.pop();
  }

  return nearest.map((entry) => entry.item);
};

export const useGraphLayoutState = ({
  people,
  relationships,
  photoEdges,
  photoClusters,
  viewMode,
  familyViewStyle,
  selectedPersonId,
  hoveredPersonId,
  focusPersonId,
  pinnedPersonId,
  renderLimit
}: UseGraphLayoutStateOptions) => {
  const positionedPeople = useMemo(
    () =>
      positionPeople(people, relationships, {
        mode: viewMode,
        photoClusters,
        familyViewStyle: familyViewStyle ?? defaultFamilyViewStyle,
        selectedPersonId
      }),
    [familyViewStyle, people, photoClusters, relationships, selectedPersonId, viewMode]
  );
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const positionedById = useMemo(() => new Map(positionedPeople.map((item) => [item.person.id, item])), [positionedPeople]);

  const selectedPerson = useMemo(
    () => (selectedPersonId ? peopleById.get(selectedPersonId) ?? null : null),
    [peopleById, selectedPersonId]
  );
  const prioritizedNodeIds = useMemo(() => {
    return new Set(
      [selectedPersonId, hoveredPersonId, focusPersonId, pinnedPersonId].filter((value): value is string => Boolean(value))
    );
  }, [focusPersonId, hoveredPersonId, pinnedPersonId, selectedPersonId]);

  const focusPosition = useMemo<NodePosition>(() => {
    const focused = focusPersonId ? positionedById.get(focusPersonId) : undefined;
    return focused?.position ?? [0, 0, 0];
  }, [focusPersonId, positionedById]);

  const visiblePeople = useMemo(() => {
    const ensurePinnedVisible = (items: typeof positionedPeople) => {
      if (!pinnedPersonId) {
        return items;
      }
      const alreadyVisible = items.some((item) => item.person.id === pinnedPersonId);
      if (alreadyVisible) {
        return items;
      }
      const pinnedItem = positionedById.get(pinnedPersonId);
      if (!pinnedItem) {
        return items;
      }
      if (items.length === 0) {
        return [pinnedItem];
      }
      return [pinnedItem, ...items.slice(0, Math.max(items.length - 1, 0))];
    };

    if (positionedPeople.length <= renderLimit) {
      return ensurePinnedVisible(positionedPeople);
    }

    if (!focusPersonId) {
      return ensurePinnedVisible(positionedPeople.slice(0, renderLimit));
    }

    const focused = positionedById.get(focusPersonId);
    if (!focused) {
      return ensurePinnedVisible(positionedPeople.slice(0, renderLimit));
    }

    const subset = pickNearest(positionedPeople, focused.position, renderLimit);
    return ensurePinnedVisible(subset);
  }, [focusPersonId, pinnedPersonId, positionedById, positionedPeople, renderLimit]);
  const displayVisiblePeople = useMemo(() => {
    const baseItems = visiblePeople.map((item) => ({
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
    baseItems[pinnedIndex] = {
      person: pinnedItem.person,
      displayPosition: openSlot
    };

    return baseItems;
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
  const visibleRelationshipLines = useMemo(() => {
    if (viewMode === "photo") {
      const lines: Array<{ key: string; from: NodePosition; to: NodePosition; kind: RelationshipKind; opacity?: number }> =
        [];
      for (const edge of photoEdges) {
        const from = visiblePositionsById.get(edge.personAId);
        const to = visiblePositionsById.get(edge.personBId);
        if (!from || !to) {
          continue;
        }
        lines.push({
          key: `photo:${edge.personAId}|${edge.personBId}`,
          from,
          to,
          kind: "CO_OCCURRENCE",
          opacity: Math.min(0.95, Math.max(0.2, 0.2 + edge.score * 0.75))
        });
      }
      return lines;
    }

    const seen = new Set<string>();
    const lines: Array<{ key: string; from: NodePosition; to: NodePosition; kind: RelationshipKind; opacity?: number }> =
      [];
    for (const relationship of relationships) {
      const first = relationship.fromPersonId;
      const second = relationship.toPersonId;
      const canonicalPair = [first, second].sort().join("|");
      const kind = relationshipKindForType(relationship.type);
      const key = `${canonicalPair}:${kind}`;
      if (seen.has(key)) {
        continue;
      }
      const from = visiblePositionsById.get(first);
      const to = visiblePositionsById.get(second);
      if (!from || !to) {
        continue;
      }
      seen.add(key);
      lines.push({ key, from, to, kind });
    }
    return lines;
  }, [photoEdges, relationships, viewMode, visiblePositionsById]);

  return {
    peopleById,
    selectedPerson,
    prioritizedNodeIds,
    displayVisiblePeople,
    visiblePositionsById,
    graphBounds,
    visibleRelationshipLines
  };
};
