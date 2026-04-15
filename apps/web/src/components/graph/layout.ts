import type { ImmichPerson, PhotoCluster, RelationshipRecord, RelationshipType } from "../../lib/api";

export type NodePosition = [number, number, number];
export type GraphLayoutMode = "family" | "photo";
export type FamilyViewStyle = "generationTree" | "centeredRelationshipMap" | "hybridTreeList" | "cleaned3D";
export const defaultFamilyViewStyle: FamilyViewStyle = "generationTree";
type ParentChildEdge = { parentId: string; childId: string };
type SpousePair = { firstPersonId: string; secondPersonId: string };
type SiblingPair = { firstPersonId: string; secondPersonId: string };

export const inverseRelationshipType = (type: RelationshipType): RelationshipType => {
  if (type === "PARENT_OF") {
    return "CHILD_OF";
  }
  if (type === "CHILD_OF") {
    return "PARENT_OF";
  }
  return type;
};

export const hashToNumber = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

export const getLastNameKey = (fullName: string) => {
  const normalized = fullName.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return "_unknown";
  }
  const parts = normalized.split(" ");
  const lastName = parts.at(-1);
  if (!lastName || parts.length < 2) {
    return "_unknown";
  }
  return lastName;
};

export const subtractPosition = (point: NodePosition, offset: NodePosition): NodePosition => [
  point[0] - offset[0],
  point[1] - offset[1],
  point[2] - offset[2]
];

export const distanceSquared = (a: NodePosition, b: NodePosition) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

const deriveParentChildEdges = (relationships: RelationshipRecord[]) => {
  const edges = new Map<string, ParentChildEdge>();
  for (const relationship of relationships) {
    if (relationship.type === "PARENT_OF") {
      edges.set(`${relationship.fromPersonId}->${relationship.toPersonId}`, {
        parentId: relationship.fromPersonId,
        childId: relationship.toPersonId
      });
    }
    if (relationship.type === "CHILD_OF") {
      edges.set(`${relationship.toPersonId}->${relationship.fromPersonId}`, {
        parentId: relationship.toPersonId,
        childId: relationship.fromPersonId
      });
    }
  }
  return [...edges.values()];
};

const deriveSpousePairs = (relationships: RelationshipRecord[]) => {
  const pairs = new Map<string, SpousePair>();
  for (const relationship of relationships) {
    if (relationship.type !== "SPOUSE_OF") {
      continue;
    }
    const [firstPersonId, secondPersonId] = [relationship.fromPersonId, relationship.toPersonId].sort();
    if (!firstPersonId || !secondPersonId) {
      continue;
    }
    pairs.set(`${firstPersonId}|${secondPersonId}`, { firstPersonId, secondPersonId });
  }
  return [...pairs.values()];
};

const deriveSiblingPairs = (relationships: RelationshipRecord[]) => {
  const pairs = new Map<string, SiblingPair>();
  for (const relationship of relationships) {
    if (relationship.type !== "SIBLING_OF") {
      continue;
    }
    const [firstPersonId, secondPersonId] = [relationship.fromPersonId, relationship.toPersonId].sort();
    if (!firstPersonId || !secondPersonId) {
      continue;
    }
    pairs.set(`${firstPersonId}|${secondPersonId}`, { firstPersonId, secondPersonId });
  }
  return [...pairs.values()];
};

const indexPairsByPerson = <TPair extends { firstPersonId: string; secondPersonId: string }>(
  pairs: TPair[]
) => {
  const byPerson = new Map<string, TPair[]>();
  for (const pair of pairs) {
    const firstList = byPerson.get(pair.firstPersonId);
    if (firstList) {
      firstList.push(pair);
    } else {
      byPerson.set(pair.firstPersonId, [pair]);
    }

    const secondList = byPerson.get(pair.secondPersonId);
    if (secondList) {
      secondList.push(pair);
    } else {
      byPerson.set(pair.secondPersonId, [pair]);
    }
  }
  return byPerson;
};

const collectComponentPairs = <TPair extends { firstPersonId: string; secondPersonId: string }>(
  component: string[],
  componentSet: Set<string>,
  pairsByPerson: Map<string, TPair[]>
) => {
  const pairsByKey = new Map<string, TPair>();
  for (const personId of component) {
    const pairs = pairsByPerson.get(personId) ?? [];
    for (const pair of pairs) {
      if (!componentSet.has(pair.firstPersonId) || !componentSet.has(pair.secondPersonId)) {
        continue;
      }
      const key = [pair.firstPersonId, pair.secondPersonId].sort().join("|");
      if (!pairsByKey.has(key)) {
        pairsByKey.set(key, pair);
      }
    }
  }
  return [...pairsByKey.values()];
};

const buildTreePositions = (
  people: ImmichPerson[],
  parentChildEdges: ParentChildEdge[],
  spousePairs: SpousePair[],
  siblingPairs: SiblingPair[]
) => {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const spousePairsByPerson = indexPairsByPerson(spousePairs);
  const siblingPairsByPerson = indexPairsByPerson(siblingPairs);
  const childrenByParent = new Map<string, Set<string>>();
  const parentsByChild = new Map<string, Set<string>>();
  const undirected = new Map<string, Set<string>>();

  for (const edge of parentChildEdges) {
    if (!peopleById.has(edge.parentId) || !peopleById.has(edge.childId)) {
      continue;
    }
    if (!childrenByParent.has(edge.parentId)) {
      childrenByParent.set(edge.parentId, new Set());
    }
    childrenByParent.get(edge.parentId)?.add(edge.childId);

    if (!parentsByChild.has(edge.childId)) {
      parentsByChild.set(edge.childId, new Set());
    }
    parentsByChild.get(edge.childId)?.add(edge.parentId);

    if (!undirected.has(edge.parentId)) {
      undirected.set(edge.parentId, new Set());
    }
    if (!undirected.has(edge.childId)) {
      undirected.set(edge.childId, new Set());
    }
    undirected.get(edge.parentId)?.add(edge.childId);
    undirected.get(edge.childId)?.add(edge.parentId);
  }

  const components: string[][] = [];
  const visited = new Set<string>();
  for (const startId of undirected.keys()) {
    if (visited.has(startId)) {
      continue;
    }
    const stack = [startId];
    const component: string[] = [];
    visited.add(startId);

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      component.push(current);
      for (const next of undirected.get(current) ?? []) {
        if (visited.has(next)) {
          continue;
        }
        visited.add(next);
        stack.push(next);
      }
    }

    components.push(component);
  }

  const positions = new Map<string, NodePosition>();
  const componentLayoutColumns = Math.max(1, Math.ceil(Math.sqrt(components.length)));
  const componentGapX = 8;
  const componentGapZ = 10;
  const componentSpanByIndex = components.map((component) => {
    const nodeCount = Math.max(component.length, 1);
    return {
      x: Math.max(14, Math.sqrt(nodeCount) * 8),
      z: Math.max(10, Math.sqrt(nodeCount) * 4.5)
    };
  });
  const rowCount = Math.ceil(components.length / componentLayoutColumns);
  const rowMaxSpanZ: number[] = [];
  const rowSpanX: number[] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const start = rowIndex * componentLayoutColumns;
    const end = Math.min(start + componentLayoutColumns, components.length);
    const spans = componentSpanByIndex.slice(start, end);
    const maxZ = spans.length > 0 ? Math.max(...spans.map((span) => span.z)) : 10;
    const totalX =
      spans.reduce((sum, span) => sum + span.x, 0) + Math.max(spans.length - 1, 0) * componentGapX;
    rowSpanX.push(totalX);
    rowMaxSpanZ.push(maxZ);
  }
  const totalSpanZ =
    rowMaxSpanZ.reduce((sum, span) => sum + span, 0) + Math.max(rowCount - 1, 0) * componentGapZ;
  const componentCenterByIndex = new Map<number, NodePosition>();
  let zCursor = -totalSpanZ / 2;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowStart = rowIndex * componentLayoutColumns;
    const rowEnd = Math.min(rowStart + componentLayoutColumns, components.length);
    const rowHeight = rowMaxSpanZ[rowIndex] ?? 10;
    const rowWidth = rowSpanX[rowIndex] ?? 14;
    const rowCenterZ = zCursor + rowHeight / 2;
    let xCursor = -rowWidth / 2;

    for (let componentIndex = rowStart; componentIndex < rowEnd; componentIndex += 1) {
      const span = componentSpanByIndex[componentIndex];
      if (!span) {
        continue;
      }
      const componentCenterX = xCursor + span.x / 2;
      componentCenterByIndex.set(componentIndex, [componentCenterX, 0, rowCenterZ]);
      xCursor += span.x + componentGapX;
    }

    zCursor += rowHeight + componentGapZ;
  }
  const levelSpacingX = 2.2;
  const treeTopY = 7;
  const levelStepY = 3.2;

  components.forEach((component, componentIndex) => {
    const componentSet = new Set(component);
    const roots = component.filter((personId) => {
      const parents = parentsByChild.get(personId);
      return !parents || [...parents].every((parentId) => !componentSet.has(parentId));
    });
    const rootIds = roots.length > 0 ? roots : [component[0]];

    const depthById = new Map<string, number>();
    for (const personId of component) {
      depthById.set(personId, 0);
    }
    for (const rootId of rootIds) {
      if (rootId) {
        depthById.set(rootId, 0);
      }
    }

    for (let pass = 0; pass < component.length; pass += 1) {
      let changed = false;
      for (const parentId of component) {
        const parentDepth = depthById.get(parentId) ?? 0;
        for (const childId of childrenByParent.get(parentId) ?? []) {
          if (!componentSet.has(childId)) {
            continue;
          }
          const nextDepth = parentDepth + 1;
          if (nextDepth > (depthById.get(childId) ?? 0)) {
            depthById.set(childId, nextDepth);
            changed = true;
          }
        }
      }
      if (!changed) {
        break;
      }
    }

    const parentsInComponentByChild = new Map<string, string[]>();
    for (const childId of component) {
      const parents = [...(parentsByChild.get(childId) ?? [])]
        .filter((parentId) => componentSet.has(parentId))
        .sort((a, b) => {
          const nameA = peopleById.get(a)?.name ?? a;
          const nameB = peopleById.get(b)?.name ?? b;
          return nameA.localeCompare(nameB);
        });
      parentsInComponentByChild.set(childId, parents);
    }

    const primaryParentByChild = new Map<string, string>();
    for (const childId of component) {
      const parents = parentsInComponentByChild.get(childId) ?? [];
      if (parents.length === 0) {
        continue;
      }
      const selectedParent = [...parents].sort(
        (a, b) => (depthById.get(b) ?? 0) - (depthById.get(a) ?? 0)
      )[0];
      if (selectedParent) {
        primaryParentByChild.set(childId, selectedParent);
      }
    }

    const primaryChildrenByParent = new Map<string, string[]>();
    for (const personId of component) {
      primaryChildrenByParent.set(personId, []);
    }
    for (const childId of component) {
      const parentId = primaryParentByChild.get(childId);
      if (!parentId) {
        continue;
      }
      primaryChildrenByParent.get(parentId)?.push(childId);
    }
    for (const children of primaryChildrenByParent.values()) {
      children.sort((a, b) => {
        const nameA = peopleById.get(a)?.name ?? a;
        const nameB = peopleById.get(b)?.name ?? b;
        return nameA.localeCompare(nameB);
      });
    }

    const [componentCenterX, , componentCenterZ] = componentCenterByIndex.get(componentIndex) ?? [0, 0, 0];
    const widthMemo = new Map<string, number>();
    const computing = new Set<string>();
    const subtreeWidth = (personId: string): number => {
      if (widthMemo.has(personId)) {
        return widthMemo.get(personId) ?? 1;
      }
      if (computing.has(personId)) {
        return 1;
      }
      computing.add(personId);
      const children = primaryChildrenByParent.get(personId) ?? [];
      const width =
        children.length === 0 ? 1 : children.reduce((total, childId) => total + subtreeWidth(childId), 0);
      computing.delete(personId);
      widthMemo.set(personId, width);
      return width;
    };

    const xById = new Map<string, number>();
    const placeSubtree = (personId: string, leftUnit: number) => {
      const children = primaryChildrenByParent.get(personId) ?? [];
      if (children.length === 0) {
        xById.set(personId, leftUnit + 0.5);
        return leftUnit + 1;
      }

      let cursor = leftUnit;
      for (const childId of children) {
        placeSubtree(childId, cursor);
        cursor += subtreeWidth(childId);
      }

      const firstChild = children[0];
      const lastChild = children[children.length - 1];
      const firstX = firstChild ? (xById.get(firstChild) ?? leftUnit) : leftUnit;
      const lastX = lastChild ? (xById.get(lastChild) ?? leftUnit + 1) : leftUnit + 1;
      xById.set(personId, (firstX + lastX) / 2);
      return cursor;
    };

    const sortedRoots = [...new Set(rootIds.filter((id): id is string => Boolean(id)))].sort((a, b) => {
      const nameA = peopleById.get(a)?.name ?? a;
      const nameB = peopleById.get(b)?.name ?? b;
      return nameA.localeCompare(nameB);
    });

    let forestCursor = 0;
    for (const rootId of sortedRoots) {
      placeSubtree(rootId, forestCursor);
      forestCursor += subtreeWidth(rootId) + 1;
    }

    const assigned = new Set(xById.keys());
    const dangling = component.filter((personId) => !assigned.has(personId));
    for (const personId of dangling) {
      xById.set(personId, forestCursor + 0.5);
      forestCursor += 1;
    }

    const spousePairsInComponent = collectComponentPairs(component, componentSet, spousePairsByPerson);
    const spouseGap = 1.2;
    for (const pair of spousePairsInComponent) {
      const firstX = xById.get(pair.firstPersonId);
      const secondX = xById.get(pair.secondPersonId);
      if (firstX === undefined || secondX === undefined) {
        continue;
      }

      const firstDepth = depthById.get(pair.firstPersonId) ?? 0;
      const secondDepth = depthById.get(pair.secondPersonId) ?? 0;
      const sharedDepth = Math.max(firstDepth, secondDepth);
      depthById.set(pair.firstPersonId, sharedDepth);
      depthById.set(pair.secondPersonId, sharedDepth);

      const midpoint = (firstX + secondX) / 2;
      const firstName = peopleById.get(pair.firstPersonId)?.name ?? pair.firstPersonId;
      const secondName = peopleById.get(pair.secondPersonId)?.name ?? pair.secondPersonId;
      const [leftId, rightId] =
        firstName.localeCompare(secondName) <= 0
          ? [pair.firstPersonId, pair.secondPersonId]
          : [pair.secondPersonId, pair.firstPersonId];
      xById.set(leftId, midpoint - spouseGap / 2);
      xById.set(rightId, midpoint + spouseGap / 2);
    }

    const siblingAdjacency = new Map<string, Set<string>>();
    for (const personId of component) {
      siblingAdjacency.set(personId, new Set());
    }
    const connectSiblings = (firstPersonId: string, secondPersonId: string) => {
      if (
        !componentSet.has(firstPersonId) ||
        !componentSet.has(secondPersonId) ||
        firstPersonId === secondPersonId
      ) {
        return;
      }
      siblingAdjacency.get(firstPersonId)?.add(secondPersonId);
      siblingAdjacency.get(secondPersonId)?.add(firstPersonId);
    };
    const siblingPairsInComponent = collectComponentPairs(component, componentSet, siblingPairsByPerson);
    for (const pair of siblingPairsInComponent) {
      connectSiblings(pair.firstPersonId, pair.secondPersonId);
    }
    const childrenByParentKey = new Map<string, string[]>();
    for (const childId of component) {
      const parents = parentsInComponentByChild.get(childId) ?? [];
      if (parents.length === 0) {
        continue;
      }
      const key = [...parents].sort().join("|");
      const siblings = childrenByParentKey.get(key);
      if (siblings) {
        siblings.push(childId);
      } else {
        childrenByParentKey.set(key, [childId]);
      }
    }
    for (const siblings of childrenByParentKey.values()) {
      for (let index = 0; index < siblings.length; index += 1) {
        const firstSiblingId = siblings[index];
        for (let nextIndex = index + 1; nextIndex < siblings.length; nextIndex += 1) {
          const secondSiblingId = siblings[nextIndex];
          if (!firstSiblingId || !secondSiblingId) {
            continue;
          }
          connectSiblings(firstSiblingId, secondSiblingId);
        }
      }
    }
    const depthAlignedSiblings = new Set<string>();
    for (const startSiblingId of component) {
      if (depthAlignedSiblings.has(startSiblingId)) {
        continue;
      }
      const stack = [startSiblingId];
      const siblingGroup: string[] = [];
      depthAlignedSiblings.add(startSiblingId);
      while (stack.length > 0) {
        const currentSiblingId = stack.pop();
        if (!currentSiblingId) {
          continue;
        }
        siblingGroup.push(currentSiblingId);
        for (const adjacentSiblingId of siblingAdjacency.get(currentSiblingId) ?? []) {
          if (depthAlignedSiblings.has(adjacentSiblingId)) {
            continue;
          }
          depthAlignedSiblings.add(adjacentSiblingId);
          stack.push(adjacentSiblingId);
        }
      }
      if (siblingGroup.length < 2) {
        continue;
      }
      const alignedDepth = Math.max(...siblingGroup.map((personId) => depthById.get(personId) ?? 0));
      for (const siblingId of siblingGroup) {
        depthById.set(siblingId, alignedDepth);
      }
    }

    const shiftSubtree = (rootId: string, deltaX: number, seen = new Set<string>()) => {
      if (Math.abs(deltaX) < 0.001 || seen.has(rootId)) {
        return;
      }
      seen.add(rootId);
      xById.set(rootId, (xById.get(rootId) ?? 0) + deltaX);
      for (const childId of primaryChildrenByParent.get(rootId) ?? []) {
        shiftSubtree(childId, deltaX, seen);
      }
    };

    const childGap = 1.7;
    for (const pair of spousePairsInComponent) {
      const firstX = xById.get(pair.firstPersonId);
      const secondX = xById.get(pair.secondPersonId);
      if (firstX === undefined || secondX === undefined) {
        continue;
      }

      const midpoint = (firstX + secondX) / 2;
      const firstChildren = childrenByParent.get(pair.firstPersonId) ?? new Set<string>();
      const secondChildren = childrenByParent.get(pair.secondPersonId) ?? new Set<string>();
      const sharedChildren = [...firstChildren]
        .filter((childId) => secondChildren.has(childId) && componentSet.has(childId))
        .sort((a, b) => {
          const nameA = peopleById.get(a)?.name ?? a;
          const nameB = peopleById.get(b)?.name ?? b;
          return nameA.localeCompare(nameB);
        });

      if (sharedChildren.length === 0) {
        continue;
      }

      const startX = midpoint - ((sharedChildren.length - 1) * childGap) / 2;
      sharedChildren.forEach((childId, index) => {
        const targetX = startX + index * childGap;
        const currentX = xById.get(childId) ?? targetX;
        const deltaX = targetX - currentX;
        shiftSubtree(childId, deltaX);
      });
    }

    const placedXs = [...xById.values()];
    const minX = placedXs.length > 0 ? Math.min(...placedXs) : 0;
    const maxX = placedXs.length > 0 ? Math.max(...placedXs) : 0;
    const midX = (minX + maxX) / 2;

    for (const personId of component) {
      const localXUnits = xById.get(personId) ?? 0;
      const localX = (localXUnits - midX) * levelSpacingX;
      const depth = depthById.get(personId) ?? 0;
      positions.set(personId, [componentCenterX + localX, treeTopY - depth * levelStepY, componentCenterZ]);
    }
  });

  return positions;
};

const positionPeopleByPhotoClusters = (
  people: ImmichPerson[],
  photoClusters: PhotoCluster[]
): Array<{
  person: ImmichPerson;
  position: NodePosition;
}> => {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const consumed = new Set<string>();
  const resolvedClusters = photoClusters
    .map((cluster) => {
      const members = cluster.personIds
        .map((personId) => peopleById.get(personId))
        .filter((person): person is ImmichPerson => !!person);
      members.forEach((member) => consumed.add(member.id));
      return {
        id: cluster.id,
        members
      };
    })
    .filter((cluster) => cluster.members.length > 0);

  // Ensure every visible person has a cluster, even if API returned no cluster info for them.
  const unclustered = people.filter((person) => !consumed.has(person.id));
  const allClusters = [
    ...resolvedClusters,
    ...unclustered.map((person) => ({
      id: `cluster:${person.id}`,
      members: [person]
    }))
  ].sort((left, right) => right.members.length - left.members.length || left.id.localeCompare(right.id));

  const columnCount = Math.max(1, Math.ceil(Math.sqrt(allClusters.length)));
  const rowCount = Math.max(1, Math.ceil(allClusters.length / columnCount));
  const clusterGapX = 14;
  const clusterGapZ = 12;
  const totalSpanX = Math.max(0, (columnCount - 1) * clusterGapX);
  const totalSpanZ = Math.max(0, (rowCount - 1) * clusterGapZ);

  return allClusters.flatMap((cluster, index) => {
    const row = Math.floor(index / columnCount);
    const col = index % columnCount;
    const centerX = col * clusterGapX - totalSpanX / 2;
    const centerZ = row * clusterGapZ - totalSpanZ / 2;
    const centerY = ((index % 4) - 1.5) * 0.8;

    return cluster.members.map((person, memberIndex) => {
      const ringSize = Math.max(6, cluster.members.length);
      const localAngle = (memberIndex / ringSize) * Math.PI * 2;
      const localRadius = 1.8 + Math.floor(memberIndex / ringSize) * 0.9;
      return {
        person,
        position: [
          centerX + Math.cos(localAngle) * localRadius,
          centerY + (memberIndex % 3) * 0.25,
          centerZ + Math.sin(localAngle) * localRadius
        ] as NodePosition
      };
    });
  });
};

type PositionedPerson = { person: ImmichPerson; position: NodePosition };

const toGenerationTreePositions = (items: PositionedPerson[]): PositionedPerson[] => {
  if (items.length === 0) {
    return items;
  }

  const minX = Math.min(...items.map((item) => item.position[0]));
  const maxX = Math.max(...items.map((item) => item.position[0]));
  const centerX = (minX + maxX) / 2;

  return items.map((item) => ({
    person: item.person,
    position: [(item.position[0] - centerX) * 1.15, item.position[1] * 1.35, 0]
  }));
};

const toCleaned3DPositions = (items: PositionedPerson[]): PositionedPerson[] =>
  items.map((item) => {
    const jitter = ((hashToNumber(item.person.id) % 5) - 2) * 0.4;
    return {
      person: item.person,
      position: [item.position[0] * 1.05, item.position[1] * 1.1, item.position[2] * 1.15 + jitter]
    };
  });

const toCenteredRelationshipMapPositions = (
  items: PositionedPerson[],
  selectedPersonId: string | null,
  parentChildEdges: ParentChildEdge[],
  spousePairs: SpousePair[],
  siblingPairs: SiblingPair[]
): PositionedPerson[] => {
  if (!selectedPersonId) {
    return toGenerationTreePositions(items);
  }

  const peopleById = new Map(items.map((item) => [item.person.id, item.person]));
  if (!peopleById.has(selectedPersonId)) {
    return toGenerationTreePositions(items);
  }

  const sorted = (ids: Iterable<string>) =>
    [...new Set(ids)]
      .filter((id) => id !== selectedPersonId && peopleById.has(id))
      .sort((left, right) =>
        (peopleById.get(left)?.name ?? left).localeCompare(peopleById.get(right)?.name ?? right)
      );
  const placeRow = (ids: string[], y: number, z: number, xOffset = 0): Array<[string, NodePosition]> =>
    ids.map((id, index) => {
      const startX = -((ids.length - 1) * 2.8) / 2;
      return [id, [xOffset + startX + index * 2.8, y, z] as NodePosition];
    });

  const parentIds = sorted(
    parentChildEdges.filter((edge) => edge.childId === selectedPersonId).map((edge) => edge.parentId)
  );
  const childIds = sorted(
    parentChildEdges.filter((edge) => edge.parentId === selectedPersonId).map((edge) => edge.childId)
  );
  const spouseIds = sorted(
    spousePairs.flatMap((pair) => {
      if (pair.firstPersonId === selectedPersonId) {
        return [pair.secondPersonId];
      }
      if (pair.secondPersonId === selectedPersonId) {
        return [pair.firstPersonId];
      }
      return [];
    })
  );
  const siblingIds = sorted(
    siblingPairs.flatMap((pair) => {
      if (pair.firstPersonId === selectedPersonId) {
        return [pair.secondPersonId];
      }
      if (pair.secondPersonId === selectedPersonId) {
        return [pair.firstPersonId];
      }
      return [];
    })
  );

  const positionedById = new Map<string, NodePosition>([[selectedPersonId, [0, 0, 0]]]);
  for (const [id, position] of placeRow(parentIds, 6.2, -0.6)) {
    positionedById.set(id, position);
  }
  for (const [id, position] of placeRow(childIds, -6.2, 0.4)) {
    positionedById.set(id, position);
  }
  for (const [id, position] of placeRow(spouseIds, 1.8, 0, 6)) {
    positionedById.set(id, position);
  }
  for (const [id, position] of placeRow(siblingIds, 0.2, 0, -6)) {
    positionedById.set(id, position);
  }

  const remainingPeople = items
    .filter((item) => !positionedById.has(item.person.id))
    .sort((left, right) => left.person.name.localeCompare(right.person.name));
  const ringSize = Math.max(remainingPeople.length, 1);
  remainingPeople.forEach((item, index) => {
    const angle = (index / ringSize) * Math.PI * 2;
    const radius = 12 + Math.floor(index / 14) * 2.4;
    positionedById.set(item.person.id, [
      Math.cos(angle) * radius,
      ((index % 3) - 1) * 0.6,
      Math.sin(angle) * radius * 0.7
    ]);
  });

  return items.map((item) => ({
    person: item.person,
    position: positionedById.get(item.person.id) ?? item.position
  }));
};

const toHybridTreeListPositions = (
  items: PositionedPerson[],
  selectedPersonId: string | null,
  relationships: RelationshipRecord[]
): PositionedPerson[] => {
  if (!selectedPersonId) {
    return toGenerationTreePositions(items);
  }

  const generationItems = toGenerationTreePositions(items);
  const byId = new Map(generationItems.map((item) => [item.person.id, item]));
  if (!byId.has(selectedPersonId)) {
    return generationItems;
  }

  const neighbors = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    const left = relationship.fromPersonId;
    const right = relationship.toPersonId;
    if (!neighbors.has(left)) {
      neighbors.set(left, new Set());
    }
    if (!neighbors.has(right)) {
      neighbors.set(right, new Set());
    }
    neighbors.get(left)?.add(right);
    neighbors.get(right)?.add(left);
  }

  const closeIds = new Set<string>([selectedPersonId]);
  const frontier: Array<{ id: string; depth: number }> = [{ id: selectedPersonId, depth: 0 }];
  while (frontier.length > 0) {
    const current = frontier.shift();
    if (!current) {
      continue;
    }
    if (current.depth >= 2) {
      continue;
    }
    for (const nextId of neighbors.get(current.id) ?? []) {
      if (closeIds.has(nextId)) {
        continue;
      }
      closeIds.add(nextId);
      frontier.push({ id: nextId, depth: current.depth + 1 });
    }
  }

  const positionedById = new Map<string, NodePosition>();
  const farPeople = generationItems
    .filter((item) => !closeIds.has(item.person.id))
    .sort((left, right) => left.person.name.localeCompare(right.person.name));
  generationItems.forEach((item) => {
    if (closeIds.has(item.person.id)) {
      positionedById.set(item.person.id, item.position);
    }
  });

  const farCount = Math.max(farPeople.length, 1);
  farPeople.forEach((item, index) => {
    const angle = (index / farCount) * Math.PI * 2;
    const radius = 15 + Math.floor(index / 24) * 2;
    positionedById.set(item.person.id, [
      Math.cos(angle) * radius,
      -9 + (index % 2) * 0.7,
      Math.sin(angle) * radius * 0.48
    ]);
  });

  return items.map((item) => ({
    person: item.person,
    position: positionedById.get(item.person.id) ?? item.position
  }));
};

export const positionPeople = (
  people: ImmichPerson[],
  relationships: RelationshipRecord[],
  options?: {
    mode?: GraphLayoutMode;
    photoClusters?: PhotoCluster[];
    familyViewStyle?: FamilyViewStyle;
    selectedPersonId?: string | null;
  }
) => {
  if (options?.mode === "photo") {
    return positionPeopleByPhotoClusters(people, options.photoClusters ?? []);
  }

  const parentChildEdges = deriveParentChildEdges(relationships);
  const spousePairs = deriveSpousePairs(relationships);
  const siblingPairs = deriveSiblingPairs(relationships);
  const treePositions = buildTreePositions(people, parentChildEdges, spousePairs, siblingPairs);
  const withoutTreePosition = people.filter((person) => !treePositions.has(person.id));
  const connectedPeople = people.filter((person) => treePositions.has(person.id));

  const clustersByLastName = withoutTreePosition.reduce<Map<string, ImmichPerson[]>>((acc, person) => {
    const key = getLastNameKey(person.name);
    const existing = acc.get(key);
    if (existing) {
      existing.push(person);
    } else {
      acc.set(key, [person]);
    }
    return acc;
  }, new Map());
  const connectedAnchorsByLastName = connectedPeople.reduce<Map<string, NodePosition[]>>((acc, person) => {
    const key = getLastNameKey(person.name);
    const position = treePositions.get(person.id);
    if (!position) {
      return acc;
    }
    const existing = acc.get(key);
    if (existing) {
      existing.push(position);
    } else {
      acc.set(key, [position]);
    }
    return acc;
  }, new Map());

  const clusterKeys = [...clustersByLastName.keys()].sort();
  const clusterCount = clusterKeys.length || 1;
  const positionedUnconnected = clusterKeys.flatMap((key, clusterIndex) => {
    const clusterPeople = clustersByLastName.get(key) ?? [];
    const anchorPositions = connectedAnchorsByLastName.get(key) ?? [];
    const hasAnchor = anchorPositions.length > 0;
    let center: NodePosition;
    if (hasAnchor) {
      const anchorCenter = anchorPositions.reduce<NodePosition>(
        (acc, position) => [acc[0] + position[0], acc[1] + position[1], acc[2] + position[2]],
        [0, 0, 0]
      );
      const avgAnchor: NodePosition = [
        anchorCenter[0] / anchorPositions.length,
        anchorCenter[1] / anchorPositions.length,
        anchorCenter[2] / anchorPositions.length
      ];
      const angle = (hashToNumber(key) % 360) * (Math.PI / 180);
      const proximityRadius = 3.4 + (hashToNumber(`${key}-r`) % 3) * 0.55;
      center = [
        avgAnchor[0] + Math.cos(angle) * proximityRadius,
        avgAnchor[1] - 1.4,
        avgAnchor[2] + Math.sin(angle) * proximityRadius
      ];
    } else {
      const angle = (clusterIndex / clusterCount) * Math.PI * 2;
      const ringRadius = 16 + (clusterIndex % 3) * 2;
      center = [Math.cos(angle) * ringRadius, ((clusterIndex % 5) - 2) * 1.2, Math.sin(angle) * ringRadius];
    }

    return clusterPeople.map((person, memberIndex) => {
      const localAngle = (memberIndex / Math.max(clusterPeople.length, 1)) * Math.PI * 2;
      const localRadius = 1.5 + Math.floor(memberIndex / 10) * 0.7;
      const offset: NodePosition = [
        Math.cos(localAngle) * localRadius,
        (memberIndex % 4) * 0.3 - 0.45,
        Math.sin(localAngle) * localRadius
      ];
      return {
        person,
        position: [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]] as NodePosition
      };
    });
  });

  const positionedTreePeople = people
    .filter((person) => treePositions.has(person.id))
    .map((person) => ({
      person,
      position: treePositions.get(person.id) ?? [0, 0, 0]
    }));
  const familyPositions = [...positionedTreePeople, ...positionedUnconnected];

  switch (options?.familyViewStyle ?? defaultFamilyViewStyle) {
    case "centeredRelationshipMap":
      return toCenteredRelationshipMapPositions(
        familyPositions,
        options?.selectedPersonId ?? null,
        parentChildEdges,
        spousePairs,
        siblingPairs
      );
    case "hybridTreeList":
      return toHybridTreeListPositions(familyPositions, options?.selectedPersonId ?? null, relationships);
    case "cleaned3D":
      return toCleaned3DPositions(familyPositions);
    case "generationTree":
    default:
      return toGenerationTreePositions(familyPositions);
  }
};
