import { useMemo } from "react";
import type { ImmichPerson, PhotoCluster, PhotoCooccurrenceEdge, RelationshipRecord } from "../../lib/api";
import {
  buildParentChildIndex,
  defaultFamilyViewStyle,
  distanceSquared,
  positionPeople,
  subtractPosition,
  type FamilyViewStyle,
  type GraphLayoutMode,
  type NodePosition
} from "./layout";
import {
  relationshipKindForType,
  relationshipFilterForType,
  type GraphFilterVisibility,
  type RelationshipKind
} from "./relationshipStyles";

type UseGraphLayoutStateOptions = {
  people: ImmichPerson[];
  relationships: RelationshipRecord[];
  photoEdges: PhotoCooccurrenceEdge[];
  photoClusters: PhotoCluster[];
  viewMode: GraphLayoutMode;
  familyViewStyle?: FamilyViewStyle;
  filterVisibility: GraphFilterVisibility;
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

export const filterRelationshipsByLayer = (
  relationships: RelationshipRecord[],
  filterVisibility: GraphFilterVisibility
) =>
  relationships.filter((relationship) => {
    const filter = relationshipFilterForType(relationship.type);
    return filterVisibility[filter];
  });

export const useGraphLayoutState = ({
  people,
  relationships,
  photoEdges,
  photoClusters,
  viewMode,
  familyViewStyle,
  filterVisibility,
  selectedPersonId,
  hoveredPersonId,
  focusPersonId,
  pinnedPersonId,
  renderLimit
}: UseGraphLayoutStateOptions) => {
  const filteredRelationships = useMemo(
    () => filterRelationshipsByLayer(relationships, filterVisibility),
    [filterVisibility, relationships]
  );
  const visibleIdsFromRelationships = useMemo(() => {
    const ids = new Set<string>();
    for (const relationship of filteredRelationships) {
      ids.add(relationship.fromPersonId);
      ids.add(relationship.toPersonId);
    }
    return ids;
  }, [filteredRelationships]);

  const positionedPeople = useMemo(
    () =>
      positionPeople(people, filteredRelationships, {
        mode: viewMode,
        photoClusters,
        familyViewStyle: familyViewStyle ?? defaultFamilyViewStyle,
        selectedPersonId
      }),
    [familyViewStyle, filteredRelationships, people, photoClusters, selectedPersonId, viewMode]
  );
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const positionedById = useMemo(
    () => new Map(positionedPeople.map((item) => [item.person.id, item])),
    [positionedPeople]
  );

  const selectedPerson = useMemo(
    () => (selectedPersonId ? (peopleById.get(selectedPersonId) ?? null) : null),
    [peopleById, selectedPersonId]
  );
  const prioritizedNodeIds = useMemo(() => {
    return new Set(
      [selectedPersonId, hoveredPersonId, focusPersonId, pinnedPersonId].filter((value): value is string =>
        Boolean(value)
      )
    );
  }, [focusPersonId, hoveredPersonId, pinnedPersonId, selectedPersonId]);

  const focusPosition = useMemo<NodePosition>(() => {
    const focused = focusPersonId ? positionedById.get(focusPersonId) : undefined;
    return focused?.position ?? [0, 0, 0];
  }, [focusPersonId, positionedById]);

  const candidatePositionedPeople = useMemo(() => {
    if (viewMode === "photo" || filteredRelationships.length === 0) {
      return positionedPeople;
    }

    return positionedPeople.filter((item) =>
      visibleIdsFromRelationships.has(item.person.id)
    );
  }, [filteredRelationships.length, positionedPeople, viewMode, visibleIdsFromRelationships]);

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

    if (candidatePositionedPeople.length <= renderLimit) {
      return ensurePinnedVisible(candidatePositionedPeople);
    }

    if (!focusPersonId) {
      return ensurePinnedVisible(candidatePositionedPeople.slice(0, renderLimit));
    }

    const focused = positionedById.get(focusPersonId);
    if (!focused) {
      return ensurePinnedVisible(candidatePositionedPeople.slice(0, renderLimit));
    }

    const subset = pickNearest(candidatePositionedPeople, focused.position, renderLimit);
    return ensurePinnedVisible(subset);
  }, [
    candidatePositionedPeople,
    focusPersonId,
    pinnedPersonId,
    positionedById,
    renderLimit,
    selectedPersonId
  ]);
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
  const mergedParentGroups = useMemo(() => {
    const { parentsByChild } = buildParentChildIndex(filteredRelationships);

    const groups = new Map<string, { parentAId: string; parentBId: string; childIds: Set<string> }>();
    for (const [childId, parentSet] of parentsByChild.entries()) {
      if (parentSet.size !== 2) {
        continue;
      }
      const sortedParents = [...parentSet].sort();
      const parentAId = sortedParents[0];
      const parentBId = sortedParents[1];
      if (!parentAId || !parentBId) {
        continue;
      }
      const key = `${parentAId}|${parentBId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.childIds.add(childId);
      } else {
        groups.set(key, {
          parentAId,
          parentBId,
          childIds: new Set([childId])
        });
      }
    }

    return groups;
  }, [filteredRelationships]);
  const visibleRelationshipLines = useMemo(() => {
    if (viewMode === "photo") {
      const lines: Array<{
        key: string;
        points: NodePosition[];
        kind: RelationshipKind;
        opacity?: number;
      }> = [];
      for (const edge of photoEdges) {
        const from = visiblePositionsById.get(edge.personAId);
        const to = visiblePositionsById.get(edge.personBId);
        if (!from || !to) {
          continue;
        }
        lines.push({
          key: `photo:${edge.personAId}|${edge.personBId}`,
          points: [from, to],
          kind: "CO_OCCURRENCE",
          opacity: Math.min(0.95, Math.max(0.2, 0.2 + edge.score * 0.75))
        });
      }
      return lines;
    }

    const resolvedParentChildPairs = new Set<string>();
    const seen = new Set<string>();
    const lines: Array<{
      key: string;
      points: NodePosition[];
      kind: RelationshipKind;
      opacity?: number;
    }> = [];
    for (const [pairKey, group] of mergedParentGroups.entries()) {
      const parentA = visiblePositionsById.get(group.parentAId);
      const parentB = visiblePositionsById.get(group.parentBId);
      if (!parentA || !parentB) {
        continue;
      }

      const childPositions = [...group.childIds]
        .map((childId) => ({ childId, position: visiblePositionsById.get(childId) }))
        .filter((entry): entry is { childId: string; position: NodePosition } => Boolean(entry.position))
        .sort((left, right) => left.position[0] - right.position[0]);
      if (childPositions.length === 0) {
        continue;
      }

      for (const { childId } of childPositions) {
        resolvedParentChildPairs.add(`${group.parentAId}|${childId}`);
        resolvedParentChildPairs.add(`${group.parentBId}|${childId}`);
      }

      const parentMid: NodePosition = [
        (parentA[0] + parentB[0]) / 2,
        (parentA[1] + parentB[1]) / 2,
        (parentA[2] + parentB[2]) / 2
      ];
      const childrenCentroid = childPositions.reduce<NodePosition>(
        (acc, entry) => [acc[0] + entry.position[0], acc[1] + entry.position[1], acc[2] + entry.position[2]],
        [0, 0, 0]
      );
      const centroid: NodePosition = [
        childrenCentroid[0] / childPositions.length,
        childrenCentroid[1] / childPositions.length,
        childrenCentroid[2] / childPositions.length
      ];
      const forkBase: NodePosition = [
        parentMid[0] * 0.5 + centroid[0] * 0.5,
        parentMid[1] * 0.5 + centroid[1] * 0.5,
        parentMid[2] * 0.5 + centroid[2] * 0.5
      ];

      lines.push({
        key: `family:merge:${pairKey}:a`,
        points: [parentA, parentMid],
        kind: "PARENT_CHILD"
      });
      lines.push({
        key: `family:merge:${pairKey}:b`,
        points: [parentB, parentMid],
        kind: "PARENT_CHILD"
      });

      if (childPositions.length > 1) {
        lines.push({
          key: `family:merge:${pairKey}:trunk`,
          points: [parentMid, forkBase],
          kind: "PARENT_CHILD"
        });
      }

      const branchRoot = childPositions.length > 1 ? forkBase : parentMid;
      for (const { childId, position } of childPositions) {
        lines.push({
          key: `family:merge:${pairKey}:child:${childId}`,
          points: [branchRoot, position],
          kind: "PARENT_CHILD"
        });
      }
    }

    for (const relationship of filteredRelationships) {
      const first = relationship.fromPersonId;
      const second = relationship.toPersonId;
      const canonicalPair = [first, second].sort().join("|");
      const kind = relationshipKindForType(relationship.type);
      if (
        kind === "PARENT_CHILD" &&
        (resolvedParentChildPairs.has(`${first}|${second}`) || resolvedParentChildPairs.has(`${second}|${first}`))
      ) {
        continue;
      }
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
      lines.push({ key, points: [from, to], kind });
    }
    return lines;
  }, [filteredRelationships, mergedParentGroups, photoEdges, viewMode, visiblePositionsById]);

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
