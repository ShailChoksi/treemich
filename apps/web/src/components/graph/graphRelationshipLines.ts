import type { PhotoCooccurrenceEdge, RelationshipRecord } from "../../lib/api";
import {
  relationshipKindForType,
  type RelationshipKind
} from "./relationshipStyles";
import type { GraphLayoutMode, NodePosition } from "./layout";
/** Two-person key; person ids must not contain "|" (same contract as family unit keys in layout). */
export const pairKey = (firstId: string, secondId: string) =>
  firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`;

export const candidateParentPairKeys = (parentIds: string[]) => {
  const sorted = [...new Set(parentIds)].sort();
  if (sorted.length <= 1) {
    return sorted.length === 1 ? [sorted[0] as string] : [];
  }
  if (sorted.length === 2) {
    return [pairKey(sorted[0] as string, sorted[1] as string)];
  }
  const keys: string[] = [];
  for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
    const firstId = sorted[firstIndex];
    if (!firstId) {
      continue;
    }
    for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
      const secondId = sorted[secondIndex];
      if (!secondId) {
        continue;
      }
      keys.push(pairKey(firstId, secondId));
    }
  }
  return keys;
};

export const buildMergedParentGroups = ({
  parentsByChild,
  visibleIdSet,
  primaryFamilyUnitByPersonId
}: {
  parentsByChild: Map<string, Set<string>>;
  visibleIdSet: Set<string>;
  primaryFamilyUnitByPersonId?: Record<string, string>;
}) => {
  const groups = new Map<string, { parentAId: string; parentBId: string; childIds: Set<string> }>();
  for (const [childId, parentSet] of parentsByChild.entries()) {
    if (!visibleIdSet.has(childId)) {
      continue;
    }
    if (parentSet.size < 2) {
      continue;
    }
    const parentIds = [...parentSet];
    const candidates = candidateParentPairKeys(parentIds);
    if (candidates.length === 0) {
      continue;
    }
    const preferred = primaryFamilyUnitByPersonId?.[childId];
    const selectedPairKey =
      preferred && candidates.includes(preferred) ? preferred : (candidates[0] as string);
    const [parentAId, parentBId] = selectedPairKey.split("|"); // delimiter matches pairKey
    if (!parentAId || !parentBId) {
      continue;
    }
    if (!visibleIdSet.has(parentAId) || !visibleIdSet.has(parentBId)) {
      continue;
    }
    const key = pairKey(parentAId, parentBId);
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
};

type GraphLine = {
  key: string;
  points: NodePosition[];
  kind: RelationshipKind;
  opacity?: number;
};

export const buildVisibleRelationshipLines = ({
  viewMode,
  photoEdges,
  visiblePositionsById,
  mergedParentGroups,
  filteredRelationships,
  visibleIdSet
}: {
  viewMode: GraphLayoutMode;
  photoEdges: PhotoCooccurrenceEdge[];
  visiblePositionsById: Map<string, NodePosition>;
  mergedParentGroups: Map<string, { parentAId: string; parentBId: string; childIds: Set<string> }>;
  filteredRelationships: RelationshipRecord[];
  visibleIdSet: Set<string>;
}) => {
  if (viewMode === "photo") {
    const lines: GraphLine[] = [];
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
  const lines: GraphLine[] = [];
  for (const [parentPairKey, group] of mergedParentGroups.entries()) {
    const parentA = visiblePositionsById.get(group.parentAId);
    const parentB = visiblePositionsById.get(group.parentBId);
    if (!parentA || !parentB) {
      continue;
    }

    const childPositions: Array<{ childId: string; position: NodePosition }> = [];
    for (const childId of group.childIds) {
      const position = visiblePositionsById.get(childId);
      if (!position) {
        continue;
      }
      childPositions.push({ childId, position });
    }
    if (childPositions.length === 0) {
      continue;
    }
    if (childPositions.length > 1) {
      childPositions.sort((left, right) => left.position[0] - right.position[0]);
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
    let centroidX = 0;
    let centroidY = 0;
    let centroidZ = 0;
    for (const child of childPositions) {
      centroidX += child.position[0];
      centroidY += child.position[1];
      centroidZ += child.position[2];
    }
    const centroid: NodePosition = [
      centroidX / childPositions.length,
      centroidY / childPositions.length,
      centroidZ / childPositions.length
    ];
    const forkBase: NodePosition = [
      parentMid[0] * 0.5 + centroid[0] * 0.5,
      parentMid[1] * 0.5 + centroid[1] * 0.5,
      parentMid[2] * 0.5 + centroid[2] * 0.5
    ];

    lines.push({
      key: `family:merge:${parentPairKey}:a`,
      points: [parentA, parentMid],
      kind: "PARENT_CHILD"
    });
    lines.push({
      key: `family:merge:${parentPairKey}:b`,
      points: [parentB, parentMid],
      kind: "PARENT_CHILD"
    });

    if (childPositions.length > 1) {
      lines.push({
        key: `family:merge:${parentPairKey}:trunk`,
        points: [parentMid, forkBase],
        kind: "PARENT_CHILD"
      });
    }

    const branchRoot = childPositions.length > 1 ? forkBase : parentMid;
    for (const { childId, position } of childPositions) {
      lines.push({
        key: `family:merge:${parentPairKey}:child:${childId}`,
        points: [branchRoot, position],
        kind: "PARENT_CHILD"
      });
    }
  }

  for (const relationship of filteredRelationships) {
    const first = relationship.fromPersonId;
    const second = relationship.toPersonId;
    if (!visibleIdSet.has(first) || !visibleIdSet.has(second)) {
      continue;
    }
    const canonicalPair = pairKey(first, second);
    const kind = relationshipKindForType(relationship.type);
    if (
      kind === "PARENT_CHILD" &&
      (resolvedParentChildPairs.has(`${first}|${second}`) ||
        resolvedParentChildPairs.has(`${second}|${first}`))
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
    lines.push({
      key,
      points: [from, to],
      kind
    });
  }

  return lines;
};
