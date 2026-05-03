/**
 * @file Shared generation-tree layout for family graph positions.
 */

import type { RelationshipType } from "../index.js";

export type NodePosition = [number, number, number];
export type GenerationTreePerson = {
  id: string;
  name: string;
};
export type GenerationTreeRelationship = {
  fromPersonId: string;
  toPersonId: string;
  type: RelationshipType;
};
export type PositionedGenerationTreePerson<Person extends GenerationTreePerson = GenerationTreePerson> = {
  person: Person;
  position: NodePosition;
};
export type GenerationTreeLayoutPreferences = {
  horizontalSpacing?: number;
  verticalSpacing?: number;
  spouseBranchZDistance?: number;
  spouseBranchSensitivity?: number;
};
type ResolvedGenerationTreeLayoutPreferences = {
  horizontalSpacing: number;
  verticalSpacing: number;
  spouseBranchZDistance: number;
  spouseBranchSensitivity: number;
};

type DirectionalNeighborBuckets = {
  up: string[];
  down: string[];
  side: string[];
};
type SpousePair = { firstPersonId: string; secondPersonId: string };
type SiblingPair = { firstPersonId: string; secondPersonId: string };
type ParentChildEdge = { parentId: string; childId: string };
type FamilyUnit = {
  key: string;
  parentIds: string[];
  childIds: Set<string>;
};

type BuchheimNode = {
  id: string;
  width: number;
  children: BuchheimNode[];
  parent: BuchheimNode | null;
  number: number;
  prelim: number;
  mod: number;
  change: number;
  shift: number;
  thread: BuchheimNode | null;
  ancestor: BuchheimNode;
  x: number;
  y: number;
};

const resolveGenerationTreeLayoutPreferences = (
  preferences: GenerationTreeLayoutPreferences | null | undefined
): ResolvedGenerationTreeLayoutPreferences => ({
  horizontalSpacing: preferences?.horizontalSpacing ?? 1,
  verticalSpacing: preferences?.verticalSpacing ?? 1,
  spouseBranchZDistance: preferences?.spouseBranchZDistance ?? 1,
  spouseBranchSensitivity: preferences?.spouseBranchSensitivity ?? 1
});

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

export const buildParentChildIndex = (relationships: readonly GenerationTreeRelationship[]) => {
  const edges = new Map<string, ParentChildEdge>();
  const parentsByChild = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    let edge: ParentChildEdge | null = null;
    if (relationship.type === "PARENT_OF") {
      edge = {
        parentId: relationship.fromPersonId,
        childId: relationship.toPersonId
      };
    } else if (relationship.type === "CHILD_OF") {
      edge = {
        parentId: relationship.toPersonId,
        childId: relationship.fromPersonId
      };
    }
    if (!edge) {
      continue;
    }
    edges.set(`${edge.parentId}->${edge.childId}`, edge);
    const existingParents = parentsByChild.get(edge.childId);
    if (existingParents) {
      existingParents.add(edge.parentId);
    } else {
      parentsByChild.set(edge.childId, new Set([edge.parentId]));
    }
    const existingChildren = childrenByParent.get(edge.parentId);
    if (existingChildren) {
      existingChildren.add(edge.childId);
    } else {
      childrenByParent.set(edge.parentId, new Set([edge.childId]));
    }
  }
  return {
    edges: [...edges.values()],
    parentsByChild,
    childrenByParent
  };
};

export const buildDirectionalNeighborBuckets = (
  selectedPersonId: string,
  relationships: readonly GenerationTreeRelationship[]
): DirectionalNeighborBuckets => {
  const up = new Set<string>();
  const down = new Set<string>();
  const side = new Set<string>();

  for (const relationship of relationships) {
    if (relationship.type === "PARENT_OF") {
      if (relationship.toPersonId === selectedPersonId) {
        up.add(relationship.fromPersonId);
      } else if (relationship.fromPersonId === selectedPersonId) {
        down.add(relationship.toPersonId);
      }
      continue;
    }
    if (relationship.type === "CHILD_OF") {
      if (relationship.fromPersonId === selectedPersonId) {
        up.add(relationship.toPersonId);
      } else if (relationship.toPersonId === selectedPersonId) {
        down.add(relationship.fromPersonId);
      }
      continue;
    }
    if (relationship.fromPersonId === selectedPersonId && relationship.toPersonId !== selectedPersonId) {
      side.add(relationship.toPersonId);
      continue;
    }
    if (relationship.toPersonId === selectedPersonId && relationship.fromPersonId !== selectedPersonId) {
      side.add(relationship.fromPersonId);
    }
  }

  return {
    up: [...up],
    down: [...down],
    side: [...side]
  };
};

const derivePairsByType = (
  relationships: readonly GenerationTreeRelationship[],
  relationshipType: "SPOUSE_OF" | "SIBLING_OF"
) => {
  const pairs = new Map<string, SpousePair>();
  for (const relationship of relationships) {
    if (relationship.type !== relationshipType) {
      continue;
    }
    const firstPersonId =
      relationship.fromPersonId < relationship.toPersonId
        ? relationship.fromPersonId
        : relationship.toPersonId;
    const secondPersonId =
      relationship.fromPersonId < relationship.toPersonId
        ? relationship.toPersonId
        : relationship.fromPersonId;
    pairs.set(`${firstPersonId}|${secondPersonId}`, { firstPersonId, secondPersonId });
  }
  return [...pairs.values()];
};

const deriveSpousePairs = (relationships: readonly GenerationTreeRelationship[]) =>
  derivePairsByType(relationships, "SPOUSE_OF");

const deriveSiblingPairs = (relationships: readonly GenerationTreeRelationship[]) =>
  derivePairsByType(relationships, "SIBLING_OF");

const collectConnectedComponents = (undirected: Map<string, Set<string>>) => {
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
  return components;
};

const buildComponentCenters = (components: string[][], componentGapX: number, componentGapZ: number) => {
  const componentLayoutColumns = Math.max(1, Math.ceil(Math.sqrt(components.length)));
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
  return componentCenterByIndex;
};

const personNameById = <Person extends GenerationTreePerson>(
  peopleById: Map<string, Person>,
  personId: string
) => peopleById.get(personId)?.name ?? personId;

const sortPersonIdsByName = <Person extends GenerationTreePerson>(
  ids: Iterable<string>,
  peopleById: Map<string, Person>
) =>
  [...ids].sort((left, right) =>
    personNameById(peopleById, left).localeCompare(personNameById(peopleById, right))
  );

const familyUnitKeyFromParents = (parentIds: string[]) => [...parentIds].sort().join("|");

const enumerateCandidateUnitKeys = <Person extends GenerationTreePerson>(
  parentIds: string[],
  peopleById: Map<string, Person>
) => {
  const sorted = sortPersonIdsByName(parentIds, peopleById);
  if (sorted.length <= 1) {
    return sorted.length === 1 ? [familyUnitKeyFromParents([sorted[0] as string])] : [];
  }
  if (sorted.length === 2) {
    return [familyUnitKeyFromParents(sorted)];
  }
  const keys: string[] = [];
  for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
    const firstId = sorted[firstIndex];
    if (!firstId) {
      continue;
    }
    for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
      const secondId = sorted[secondIndex];
      if (secondId) {
        keys.push(familyUnitKeyFromParents([firstId, secondId]));
      }
    }
  }
  return keys;
};

const resolvePrimaryUnitByChild = <Person extends GenerationTreePerson>(
  component: string[],
  parentsByChild: Map<string, Set<string>>,
  peopleById: Map<string, Person>,
  primaryFamilyUnitByPersonId?: Record<string, string>
) => {
  const primaryByChild = new Map<string, string>();
  for (const childId of component) {
    const parentIds = [...(parentsByChild.get(childId) ?? [])].filter((parentId) => peopleById.has(parentId));
    if (parentIds.length === 0) {
      continue;
    }
    const candidates = enumerateCandidateUnitKeys(parentIds, peopleById);
    if (candidates.length === 0) {
      continue;
    }
    const preferred = primaryFamilyUnitByPersonId?.[childId];
    primaryByChild.set(
      childId,
      preferred && candidates.includes(preferred) ? preferred : (candidates[0] as string)
    );
  }
  return primaryByChild;
};

const buildFamilyUnitsForComponent = <Person extends GenerationTreePerson>(
  component: string[],
  parentsByChild: Map<string, Set<string>>,
  spousePairs: SpousePair[],
  peopleById: Map<string, Person>,
  primaryFamilyUnitByPersonId?: Record<string, string>
) => {
  const componentSet = new Set(component);
  const primaryUnitByChild = resolvePrimaryUnitByChild(
    component,
    parentsByChild,
    peopleById,
    primaryFamilyUnitByPersonId
  );
  const unitsByKey = new Map<string, FamilyUnit>();
  const ensureUnit = (key: string, parentIds: string[]) => {
    const existing = unitsByKey.get(key);
    if (existing) {
      return existing;
    }
    const unit: FamilyUnit = {
      key,
      parentIds,
      childIds: new Set()
    };
    unitsByKey.set(key, unit);
    return unit;
  };
  for (const childId of component) {
    const unitKey = primaryUnitByChild.get(childId);
    if (!unitKey) {
      continue;
    }
    const parentIds = unitKey.split("|").filter((id) => componentSet.has(id));
    if (parentIds.length > 0) {
      ensureUnit(unitKey, parentIds).childIds.add(childId);
    }
  }
  for (const pair of spousePairs) {
    if (!componentSet.has(pair.firstPersonId) || !componentSet.has(pair.secondPersonId)) {
      continue;
    }
    const parentIds = sortPersonIdsByName([pair.firstPersonId, pair.secondPersonId], peopleById);
    ensureUnit(familyUnitKeyFromParents(parentIds), parentIds);
  }
  const parentMembershipCount = new Map<string, number>();
  for (const unit of unitsByKey.values()) {
    for (const parentId of unit.parentIds) {
      parentMembershipCount.set(parentId, (parentMembershipCount.get(parentId) ?? 0) + 1);
    }
  }
  for (const personId of component) {
    if ((parentMembershipCount.get(personId) ?? 0) === 0) {
      ensureUnit(familyUnitKeyFromParents([personId]), [personId]);
    }
  }
  return {
    units: [...unitsByKey.values()],
    primaryUnitByChild
  };
};

const buildFamilyUnitTreeEdges = (units: FamilyUnit[], primaryUnitByChild: Map<string, string>) => {
  const parentUnitKeysByPerson = new Map<string, string[]>();
  for (const unit of units) {
    for (const parentId of unit.parentIds) {
      const list = parentUnitKeysByPerson.get(parentId);
      if (list) {
        list.push(unit.key);
      } else {
        parentUnitKeysByPerson.set(parentId, [unit.key]);
      }
    }
  }
  const unitSet = new Set(units.map((unit) => unit.key));
  const childrenByUnit = new Map<string, Set<string>>();
  for (const unit of units) {
    childrenByUnit.set(unit.key, new Set());
  }
  for (const [personId, parentUnitKey] of primaryUnitByChild.entries()) {
    if (!unitSet.has(parentUnitKey)) {
      continue;
    }
    for (const childParentUnitKey of parentUnitKeysByPerson.get(personId) ?? []) {
      if (childParentUnitKey !== parentUnitKey && unitSet.has(childParentUnitKey)) {
        childrenByUnit.get(parentUnitKey)?.add(childParentUnitKey);
      }
    }
  }
  return childrenByUnit;
};

const assignDepthsForComponent = (
  component: string[],
  componentSet: Set<string>,
  rootIds: Array<string | undefined>,
  childrenByParent: Map<string, Set<string>>,
  parentsByChild: Map<string, Set<string>>
) => {
  const depthById = new Map<string, number>();
  for (const personId of component) {
    depthById.set(personId, 0);
  }
  for (const rootId of rootIds) {
    if (rootId) {
      depthById.set(rootId, 0);
    }
  }
  const inDegreeById = new Map<string, number>();
  for (const personId of component) {
    inDegreeById.set(personId, 0);
  }
  for (const childId of component) {
    const parentIds = parentsByChild.get(childId) ?? new Set<string>();
    let inDegree = 0;
    for (const parentId of parentIds) {
      if (componentSet.has(parentId)) {
        inDegree += 1;
      }
    }
    inDegreeById.set(childId, inDegree);
  }
  const topologicalQueue = component.filter((personId) => (inDegreeById.get(personId) ?? 0) === 0);
  let topologicalQueueIndex = 0;
  const processedIds = new Set<string>();
  while (topologicalQueueIndex < topologicalQueue.length) {
    const parentId = topologicalQueue[topologicalQueueIndex];
    topologicalQueueIndex += 1;
    if (!parentId) {
      continue;
    }
    processedIds.add(parentId);
    const parentDepth = depthById.get(parentId) ?? 0;
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (!componentSet.has(childId)) {
        continue;
      }
      const nextDepth = parentDepth + 1;
      if (nextDepth > (depthById.get(childId) ?? 0)) {
        depthById.set(childId, nextDepth);
      }
      const remainingInDegree = (inDegreeById.get(childId) ?? 0) - 1;
      inDegreeById.set(childId, remainingInDegree);
      if (remainingInDegree === 0) {
        topologicalQueue.push(childId);
      }
    }
  }
  if (processedIds.size < component.length) {
    const unresolvedIds = component.filter((personId) => !processedIds.has(personId));
    for (let pass = 0; pass < unresolvedIds.length; pass += 1) {
      let changed = false;
      for (const parentId of unresolvedIds) {
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
  }
  return depthById;
};

const normalizeParentChildDepths = (
  componentSet: Set<string>,
  parentChildEdges: ParentChildEdge[],
  depthByPerson: Map<string, number>
) => {
  const passLimit = Math.max(componentSet.size, 1);
  for (let pass = 0; pass < passLimit; pass += 1) {
    let changed = false;
    for (const edge of parentChildEdges) {
      if (!componentSet.has(edge.parentId) || !componentSet.has(edge.childId)) {
        continue;
      }
      const requiredChildDepth = (depthByPerson.get(edge.parentId) ?? 0) + 1;
      if ((depthByPerson.get(edge.childId) ?? 0) < requiredChildDepth) {
        depthByPerson.set(edge.childId, requiredChildDepth);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
};

const alignCoupleDepths = (
  componentSet: Set<string>,
  parentChildEdges: ParentChildEdge[],
  spousePairs: SpousePair[],
  parentsByChild: Map<string, Set<string>>,
  depthByPerson: Map<string, number>
) => {
  const hasInComponentParents = (personId: string) =>
    [...(parentsByChild.get(personId) ?? [])].some((parentId) => componentSet.has(parentId));
  const alignPersonDepth = (personId: string, targetDepth: number) => {
    if ((depthByPerson.get(personId) ?? 0) === targetDepth) {
      return false;
    }
    depthByPerson.set(personId, targetDepth);
    return true;
  };
  const passLimit = Math.max(componentSet.size, 1);
  for (let pass = 0; pass < passLimit; pass += 1) {
    let changed = false;
    for (const pair of spousePairs) {
      if (!componentSet.has(pair.firstPersonId) || !componentSet.has(pair.secondPersonId)) {
        continue;
      }
      const left = depthByPerson.get(pair.firstPersonId) ?? 0;
      const right = depthByPerson.get(pair.secondPersonId) ?? 0;
      const leftHasParents = hasInComponentParents(pair.firstPersonId);
      const rightHasParents = hasInComponentParents(pair.secondPersonId);
      if (leftHasParents && rightHasParents) {
        continue;
      }
      if (leftHasParents) {
        changed = alignPersonDepth(pair.secondPersonId, left) || changed;
        continue;
      }
      if (rightHasParents) {
        changed = alignPersonDepth(pair.firstPersonId, right) || changed;
        continue;
      }
      const aligned = Math.max(left, right);
      changed = alignPersonDepth(pair.firstPersonId, aligned) || changed;
      changed = alignPersonDepth(pair.secondPersonId, aligned) || changed;
    }
    for (const parentIds of parentsByChild.values()) {
      const inComponent = [...parentIds].filter((id) => componentSet.has(id));
      if (inComponent.length < 2) {
        continue;
      }
      const withParents = inComponent.filter((id) => hasInComponentParents(id));
      if (withParents.length > 0) {
        const aligned = Math.max(...withParents.map((id) => depthByPerson.get(id) ?? 0));
        for (const parentId of inComponent) {
          if (!hasInComponentParents(parentId)) {
            changed = alignPersonDepth(parentId, aligned) || changed;
          }
        }
        continue;
      }
      const aligned = Math.max(...inComponent.map((id) => depthByPerson.get(id) ?? 0));
      for (const parentId of inComponent) {
        changed = alignPersonDepth(parentId, aligned) || changed;
      }
    }
    for (const edge of parentChildEdges) {
      if (!componentSet.has(edge.parentId) || !componentSet.has(edge.childId)) {
        continue;
      }
      const requiredChildDepth = (depthByPerson.get(edge.parentId) ?? 0) + 1;
      if ((depthByPerson.get(edge.childId) ?? 0) < requiredChildDepth) {
        depthByPerson.set(edge.childId, requiredChildDepth);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
};

const layoutFamilyUnitTree = <Person extends GenerationTreePerson>(
  units: FamilyUnit[],
  childrenByUnit: Map<string, Set<string>>,
  unitDepthByKey: Map<string, number>,
  peopleById: Map<string, Person>,
  layoutPreferences: ResolvedGenerationTreeLayoutPreferences
) => {
  const personRadius = 0.72;
  const coupleGap = 1.9 * layoutPreferences.horizontalSpacing;
  const siblingSeparation = 0.9 * layoutPreferences.horizontalSpacing;
  const subtreeSeparation = 1.5 * layoutPreferences.horizontalSpacing;
  const widthForUnit = (unit: FamilyUnit) =>
    unit.parentIds.length > 1 ? personRadius * 2 + coupleGap : personRadius * 2;
  const nodeById = new Map<string, BuchheimNode>();
  for (const unit of units) {
    nodeById.set(unit.key, {
      id: unit.key,
      width: widthForUnit(unit),
      children: [],
      parent: null,
      number: 1,
      prelim: 0,
      mod: 0,
      change: 0,
      shift: 0,
      thread: null,
      ancestor: null as unknown as BuchheimNode,
      x: 0,
      y: unitDepthByKey.get(unit.key) ?? 0
    });
  }
  for (const node of nodeById.values()) {
    node.ancestor = node;
  }
  const unitLabelByKey = new Map(
    units.map((unit) => [unit.key, unit.parentIds.map((id) => personNameById(peopleById, id)).join(" & ")])
  );
  for (const [parentKey, childSet] of childrenByUnit.entries()) {
    const parent = nodeById.get(parentKey);
    if (!parent) {
      continue;
    }
    const sortedChildren = [...childSet].sort((left, right) => {
      const leftName = unitLabelByKey.get(left) ?? left;
      const rightName = unitLabelByKey.get(right) ?? right;
      return leftName.localeCompare(rightName);
    });
    sortedChildren.forEach((childKey, index) => {
      const child = nodeById.get(childKey);
      if (!child || child.parent) {
        return;
      }
      child.parent = parent;
      child.number = index + 1;
      parent.children.push(child);
    });
  }
  const roots = [...nodeById.values()].filter((node) => !node.parent);
  if (roots.length === 0) {
    roots.push(...nodeById.values());
    roots.forEach((node, index) => {
      node.number = index + 1;
      node.parent = null;
    });
  }
  roots
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((root, index) => {
      root.number = index + 1;
    });
  const leftSibling = (node: BuchheimNode) => {
    if (!node.parent) {
      return null;
    }
    const siblings = node.parent.children;
    const siblingIndex = siblings.indexOf(node);
    return siblingIndex <= 0 ? null : (siblings[siblingIndex - 1] ?? null);
  };
  const distance = (left: BuchheimNode, right: BuchheimNode) =>
    left.width / 2 + right.width / 2 + (left.parent === right.parent ? siblingSeparation : subtreeSeparation);
  const nextLeft = (node: BuchheimNode | null) => (node ? (node.children[0] ?? node.thread) : null);
  const nextRight = (node: BuchheimNode | null) =>
    node ? (node.children[node.children.length - 1] ?? node.thread) : null;
  const moveSubtree = (left: BuchheimNode, right: BuchheimNode, shift: number) => {
    const subtrees = right.number - left.number;
    if (subtrees === 0) {
      return;
    }
    right.change -= shift / subtrees;
    right.shift += shift;
    left.change += shift / subtrees;
    right.prelim += shift;
    right.mod += shift;
  };
  const executeShifts = (node: BuchheimNode) => {
    let shift = 0;
    let change = 0;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (!child) {
        continue;
      }
      child.prelim += shift;
      child.mod += shift;
      change += child.change;
      shift += child.shift + change;
    }
  };
  const ancestor = (leftInner: BuchheimNode, node: BuchheimNode, defaultAncestor: BuchheimNode) => {
    if (!node.parent) {
      return defaultAncestor;
    }
    return node.parent.children.includes(leftInner.ancestor) ? leftInner.ancestor : defaultAncestor;
  };
  const apportion = (node: BuchheimNode, defaultAncestor: BuchheimNode) => {
    const sibling = leftSibling(node);
    if (!sibling || !node.parent) {
      return defaultAncestor;
    }
    let innerRight: BuchheimNode | null = node;
    let outerRight: BuchheimNode | null = node;
    let innerLeft: BuchheimNode | null = sibling;
    let outerLeft: BuchheimNode | null = node.parent.children[0] ?? null;
    let modInnerRight = innerRight.mod;
    let modOuterRight = outerRight.mod;
    let modInnerLeft = innerLeft.mod;
    let modOuterLeft = outerLeft?.mod ?? 0;
    while (nextRight(innerLeft) && nextLeft(innerRight)) {
      innerLeft = nextRight(innerLeft);
      innerRight = nextLeft(innerRight);
      outerLeft = nextLeft(outerLeft);
      outerRight = nextRight(outerRight);
      if (!innerLeft || !innerRight || !outerRight) {
        break;
      }
      outerRight.ancestor = node;
      const shift =
        innerLeft.prelim +
        modInnerLeft -
        (innerRight.prelim + modInnerRight) +
        distance(innerLeft, innerRight);
      if (shift > 0) {
        moveSubtree(ancestor(innerLeft, node, defaultAncestor), node, shift);
        modInnerRight += shift;
        modOuterRight += shift;
      }
      modInnerLeft += innerLeft.mod;
      modInnerRight += innerRight.mod;
      modOuterLeft += outerLeft?.mod ?? 0;
      modOuterRight += outerRight.mod;
    }
    if (nextRight(innerLeft) && !nextRight(outerRight) && outerRight) {
      outerRight.thread = nextRight(innerLeft);
      outerRight.mod += modInnerLeft - modOuterRight;
    }
    if (nextLeft(innerRight) && !nextLeft(outerLeft) && outerLeft) {
      outerLeft.thread = nextLeft(innerRight);
      outerLeft.mod += modInnerRight - modOuterLeft;
      defaultAncestor = node;
    }
    return defaultAncestor;
  };
  const firstWalk = (node: BuchheimNode) => {
    if (node.children.length === 0) {
      const sibling = leftSibling(node);
      node.prelim = sibling ? sibling.prelim + distance(sibling, node) : 0;
      return;
    }
    let defaultAncestor = node.children[0] as BuchheimNode;
    for (const child of node.children) {
      firstWalk(child);
      defaultAncestor = apportion(child, defaultAncestor);
    }
    executeShifts(node);
    const first = node.children[0] as BuchheimNode;
    const last = node.children[node.children.length - 1] as BuchheimNode;
    const midpoint = (first.prelim + last.prelim) / 2;
    const sibling = leftSibling(node);
    if (sibling) {
      node.prelim = sibling.prelim + distance(sibling, node);
      node.mod = node.prelim - midpoint;
    } else {
      node.prelim = midpoint;
    }
  };
  let minX = Number.POSITIVE_INFINITY;
  const secondWalk = (node: BuchheimNode, modSum: number, depth: number) => {
    node.x = node.prelim + modSum;
    node.y = depth;
    minX = Math.min(minX, node.x - node.width / 2);
    for (const child of node.children) {
      secondWalk(child, modSum + node.mod, depth + 1);
    }
  };
  const thirdWalk = (node: BuchheimNode, shift: number) => {
    node.x += shift;
    for (const child of node.children) {
      thirdWalk(child, shift);
    }
  };
  const maxRightSpan = (node: BuchheimNode): number => {
    let maxRight = node.x + node.width / 2;
    for (const child of node.children) {
      maxRight = Math.max(maxRight, maxRightSpan(child));
    }
    return maxRight;
  };
  let forestOffset = 0;
  for (const root of roots) {
    firstWalk(root);
    secondWalk(root, forestOffset, unitDepthByKey.get(root.id) ?? 0);
    if (minX < 0) {
      thirdWalk(root, -minX + 0.5);
    }
    forestOffset = Math.max(0, maxRightSpan(root)) + 2.5;
    minX = Number.POSITIVE_INFINITY;
  }
  const xByUnit = new Map<string, number>();
  for (const node of nodeById.values()) {
    xByUnit.set(node.id, node.x);
  }
  return xByUnit;
};

type VisualRowSolverInput = {
  component: string[];
  componentSet: Set<string>;
  spousePairs: SpousePair[];
  siblingPairs: SiblingPair[];
  parentsByChild: Map<string, Set<string>>;
  units: FamilyUnit[];
  primaryUnitByChild: Map<string, string>;
  pedigreeDepthByPerson: Map<string, number>;
};

const collectAncestorDistances = (
  personId: string,
  componentSet: Set<string>,
  parentsByChild: Map<string, Set<string>>
) => {
  const distanceById = new Map<string, number>([[personId, 0]]);
  const stack = [personId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const distance = distanceById.get(current) ?? 0;
    for (const parentId of parentsByChild.get(current) ?? []) {
      if (!componentSet.has(parentId) || distanceById.has(parentId)) {
        continue;
      }
      distanceById.set(parentId, distance + 1);
      stack.push(parentId);
    }
  }
  return distanceById;
};

const solveVisualDepthsForComponent = ({
  component,
  componentSet,
  spousePairs,
  siblingPairs,
  parentsByChild,
  units,
  primaryUnitByChild,
  pedigreeDepthByPerson
}: VisualRowSolverInput) => {
  const componentSpousePairs = spousePairs.filter(
    (pair) => componentSet.has(pair.firstPersonId) && componentSet.has(pair.secondPersonId)
  );
  const componentSiblingPairs = siblingPairs.filter(
    (pair) => componentSet.has(pair.firstPersonId) && componentSet.has(pair.secondPersonId)
  );
  const unitByKey = new Map(units.map((unit) => [unit.key, unit]));
  const hasInComponentParentsById = new Map<string, boolean>();
  const hasInComponentParents = (personId: string) => {
    const cached = hasInComponentParentsById.get(personId);
    if (cached !== undefined) {
      return cached;
    }
    const hasParents = [...(parentsByChild.get(personId) ?? [])].some((parentId) =>
      componentSet.has(parentId)
    );
    hasInComponentParentsById.set(personId, hasParents);
    return hasParents;
  };
  const compressionCandidateIds = new Set<string>();
  for (const pair of componentSpousePairs) {
    if (!hasInComponentParents(pair.firstPersonId) || !hasInComponentParents(pair.secondPersonId)) {
      continue;
    }
    const firstDepth = pedigreeDepthByPerson.get(pair.firstPersonId) ?? 0;
    const secondDepth = pedigreeDepthByPerson.get(pair.secondPersonId) ?? 0;
    if (Math.abs(firstDepth - secondDepth) > 1) {
      compressionCandidateIds.add(firstDepth > secondDepth ? pair.firstPersonId : pair.secondPersonId);
    }
  }
  const compressedSpouseIds = new Set(
    [...compressionCandidateIds].filter(
      (personId) =>
        ![...(parentsByChild.get(personId) ?? [])].some((parentId) => compressionCandidateIds.has(parentId))
    )
  );
  const siblingAdjacency = new Map<string, Set<string>>();
  for (const pair of componentSiblingPairs) {
    const firstSet = siblingAdjacency.get(pair.firstPersonId) ?? new Set<string>();
    firstSet.add(pair.secondPersonId);
    siblingAdjacency.set(pair.firstPersonId, firstSet);
    const secondSet = siblingAdjacency.get(pair.secondPersonId) ?? new Set<string>();
    secondSet.add(pair.firstPersonId);
    siblingAdjacency.set(pair.secondPersonId, secondSet);
  }
  const compressedSiblingIds = new Set<string>();
  const siblingQueue = [...compressedSpouseIds];
  for (const personId of siblingQueue) {
    if (compressedSiblingIds.has(personId)) {
      continue;
    }
    compressedSiblingIds.add(personId);
    for (const siblingId of siblingAdjacency.get(personId) ?? []) {
      siblingQueue.push(siblingId);
    }
  }
  const spousePersonIds = new Set<string>();
  for (const pair of componentSpousePairs) {
    spousePersonIds.add(pair.firstPersonId);
    spousePersonIds.add(pair.secondPersonId);
  }
  const hasCompressedParentUnit = (personId: string) => {
    const parentUnitKey = primaryUnitByChild.get(personId);
    const parentUnit = parentUnitKey ? unitByKey.get(parentUnitKey) : undefined;
    return parentUnit?.parentIds.some((parentId) => compressedSpouseIds.has(parentId)) ?? false;
  };
  const hasSpouseFromCompressedParentUnitByPerson = new Map<string, boolean>();
  for (const pair of componentSpousePairs) {
    if (hasCompressedParentUnit(pair.secondPersonId)) {
      hasSpouseFromCompressedParentUnitByPerson.set(pair.firstPersonId, true);
    }
    if (hasCompressedParentUnit(pair.firstPersonId)) {
      hasSpouseFromCompressedParentUnitByPerson.set(pair.secondPersonId, true);
    }
  }
  const visualDepthByPerson = new Map<string, number>();
  for (const personId of component) {
    visualDepthByPerson.set(personId, pedigreeDepthByPerson.get(personId) ?? 0);
  }
  const childIdsByParentUnitKey = new Map<string, string[]>();
  const childConstraints: Array<{
    childId: string;
    parentIds: string[];
    skipWhenSpouseFromCompressedParentUnit: boolean;
  }> = [];
  for (const [childId, parentUnitKey] of primaryUnitByChild.entries()) {
    const parentUnit = unitByKey.get(parentUnitKey);
    if (!parentUnit) {
      continue;
    }
    childIdsByParentUnitKey.set(parentUnitKey, [
      ...(childIdsByParentUnitKey.get(parentUnitKey) ?? []),
      childId
    ]);
    const parentUnitHasCompressedSpouse = parentUnit.parentIds.some((parentId) =>
      compressedSpouseIds.has(parentId)
    );
    childConstraints.push({
      childId,
      parentIds: parentUnit.parentIds,
      skipWhenSpouseFromCompressedParentUnit:
        spousePersonIds.has(childId) &&
        !parentUnitHasCompressedSpouse &&
        (hasSpouseFromCompressedParentUnitByPerson.get(childId) ?? false)
    });
  }
  const spouseConstraints = componentSpousePairs.map((pair) => {
    const firstHasParents = hasInComponentParents(pair.firstPersonId);
    const secondHasParents = hasInComponentParents(pair.secondPersonId);
    const pedigreeGap = Math.abs(
      (pedigreeDepthByPerson.get(pair.firstPersonId) ?? 0) -
        (pedigreeDepthByPerson.get(pair.secondPersonId) ?? 0)
    );
    return {
      firstPersonId: pair.firstPersonId,
      secondPersonId: pair.secondPersonId,
      firstHasParents,
      secondHasParents,
      firstHasCompressedParentUnit: hasCompressedParentUnit(pair.firstPersonId),
      secondHasCompressedParentUnit: hasCompressedParentUnit(pair.secondPersonId),
      hasCompressedDepthGap:
        pedigreeGap > 1 &&
        (compressedSpouseIds.has(pair.firstPersonId) || compressedSpouseIds.has(pair.secondPersonId))
    };
  });
  const setVisualDepth = (personId: string, depth: number) => {
    if ((visualDepthByPerson.get(personId) ?? 0) === depth) {
      return false;
    }
    visualDepthByPerson.set(personId, depth);
    return true;
  };
  const getMaxVisualDepth = (personIds: string[]) => {
    let maxDepth = 0;
    for (const personId of personIds) {
      maxDepth = Math.max(maxDepth, visualDepthByPerson.get(personId) ?? 0);
    }
    return maxDepth;
  };
  const passLimit = Math.max(component.length, 1);
  for (let pass = 0; pass < passLimit; pass += 1) {
    let changed = false;
    for (const constraint of childConstraints) {
      if (!constraint.skipWhenSpouseFromCompressedParentUnit) {
        changed = setVisualDepth(constraint.childId, getMaxVisualDepth(constraint.parentIds) + 1) || changed;
      }
    }
    for (const constraint of spouseConstraints) {
      const left = visualDepthByPerson.get(constraint.firstPersonId) ?? 0;
      const right = visualDepthByPerson.get(constraint.secondPersonId) ?? 0;
      let aligned = Math.max(left, right);
      if (constraint.firstHasCompressedParentUnit !== constraint.secondHasCompressedParentUnit) {
        aligned = constraint.firstHasCompressedParentUnit ? left : right;
      } else if (constraint.firstHasParents && constraint.secondHasParents) {
        aligned = constraint.hasCompressedDepthGap ? Math.min(left, right) : Math.max(left, right);
      } else if (constraint.firstHasParents) {
        aligned = left;
      } else if (constraint.secondHasParents) {
        aligned = right;
      }
      changed = setVisualDepth(constraint.firstPersonId, aligned) || changed;
      changed = setVisualDepth(constraint.secondPersonId, aligned) || changed;
    }
    for (const pair of componentSiblingPairs) {
      const first = visualDepthByPerson.get(pair.firstPersonId) ?? 0;
      const second = visualDepthByPerson.get(pair.secondPersonId) ?? 0;
      let aligned = Math.max(first, second);
      if (compressedSpouseIds.has(pair.firstPersonId)) {
        aligned = first;
      } else if (compressedSpouseIds.has(pair.secondPersonId)) {
        aligned = second;
      } else if (
        compressedSiblingIds.has(pair.firstPersonId) &&
        compressedSiblingIds.has(pair.secondPersonId)
      ) {
        aligned = Math.min(first, second);
      }
      changed = setVisualDepth(pair.firstPersonId, aligned) || changed;
      changed = setVisualDepth(pair.secondPersonId, aligned) || changed;
    }
    for (const spouseId of compressedSpouseIds) {
      const spouseDepth = visualDepthByPerson.get(spouseId) ?? 0;
      for (const [ancestorId, distance] of collectAncestorDistances(spouseId, componentSet, parentsByChild)) {
        const alignedDepth = spouseDepth - distance;
        changed = setVisualDepth(ancestorId, alignedDepth) || changed;
        const parentUnitKey = primaryUnitByChild.get(ancestorId);
        for (const siblingId of parentUnitKey ? (childIdsByParentUnitKey.get(parentUnitKey) ?? []) : []) {
          changed = setVisualDepth(siblingId, alignedDepth) || changed;
        }
      }
    }
    if (!changed) {
      break;
    }
  }
  return visualDepthByPerson;
};

const applyPerpendicularMinorSpouseBranches = (
  component: string[],
  spousePairs: SpousePair[],
  parentsByChild: Map<string, Set<string>>,
  childrenByParent: Map<string, Set<string>>,
  positions: Map<string, NodePosition>,
  layoutPreferences: ResolvedGenerationTreeLayoutPreferences
) => {
  if (component.length < 4) {
    return;
  }
  const componentSet = new Set(component);
  const spouseAdjacency = new Map<string, Set<string>>();
  const pairsInComponent: SpousePair[] = [];
  for (const pair of spousePairs) {
    if (!componentSet.has(pair.firstPersonId) || !componentSet.has(pair.secondPersonId)) {
      continue;
    }
    pairsInComponent.push(pair);
    spouseAdjacency.set(pair.firstPersonId, spouseAdjacency.get(pair.firstPersonId) ?? new Set());
    spouseAdjacency.set(pair.secondPersonId, spouseAdjacency.get(pair.secondPersonId) ?? new Set());
    spouseAdjacency.get(pair.firstPersonId)?.add(pair.secondPersonId);
    spouseAdjacency.get(pair.secondPersonId)?.add(pair.firstPersonId);
  }
  if (pairsInComponent.length === 0) {
    return;
  }
  const ancestorsCache = new Map<string, Set<string>>();
  const getAncestors = (personId: string): Set<string> => {
    const cached = ancestorsCache.get(personId);
    if (cached) {
      return cached;
    }
    const result = new Set<string>();
    const stack: string[] = [personId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      for (const parentId of parentsByChild.get(current) ?? []) {
        if (!componentSet.has(parentId) || parentId === personId || result.has(parentId)) {
          continue;
        }
        result.add(parentId);
        stack.push(parentId);
      }
    }
    ancestorsCache.set(personId, result);
    return result;
  };
  const sideCache = new Map<string, Set<string>>();
  const getSide = (personId: string): Set<string> => {
    const cached = sideCache.get(personId);
    if (cached) {
      return cached;
    }
    const ancestors = getAncestors(personId);
    const side = new Set<string>([personId]);
    for (const ancestorId of ancestors) {
      side.add(ancestorId);
    }
    for (const ancestorId of ancestors) {
      for (const spouseId of spouseAdjacency.get(ancestorId) ?? []) {
        if (componentSet.has(spouseId)) {
          side.add(spouseId);
        }
      }
    }
    const descendStack: string[] = [...ancestors];
    while (descendStack.length > 0) {
      const current = descendStack.pop();
      if (!current) {
        continue;
      }
      for (const childId of childrenByParent.get(current) ?? []) {
        if (!componentSet.has(childId) || childId === personId || side.has(childId)) {
          continue;
        }
        side.add(childId);
        descendStack.push(childId);
      }
    }
    const snapshot = [...side];
    for (const memberId of snapshot) {
      if (memberId === personId) {
        continue;
      }
      for (const spouseId of spouseAdjacency.get(memberId) ?? []) {
        if (componentSet.has(spouseId)) {
          side.add(spouseId);
        }
      }
    }
    sideCache.set(personId, side);
    return side;
  };
  const sizeRatioThreshold = Math.min(6, Math.max(0.75, 1.5 / layoutPreferences.spouseBranchSensitivity));
  const collapseFactor = 0.35;
  const zProjection = 1.6 * layoutPreferences.spouseBranchZDistance;
  const minPerpendicularShift = 3.4 * layoutPreferences.spouseBranchZDistance;
  const shiftedByOtherPair = new Set<string>();
  for (const pair of pairsInComponent) {
    const ancestorsFirst = getAncestors(pair.firstPersonId);
    if (ancestorsFirst.size === 0) {
      continue;
    }
    const ancestorsSecond = getAncestors(pair.secondPersonId);
    if (ancestorsSecond.size === 0) {
      continue;
    }
    let sharesAncestor = false;
    const smallerAncestors = ancestorsFirst.size <= ancestorsSecond.size ? ancestorsFirst : ancestorsSecond;
    const largerAncestors = smallerAncestors === ancestorsFirst ? ancestorsSecond : ancestorsFirst;
    for (const ancestorId of smallerAncestors) {
      if (largerAncestors.has(ancestorId)) {
        sharesAncestor = true;
        break;
      }
    }
    if (sharesAncestor) {
      continue;
    }
    const sideFirst = getSide(pair.firstPersonId);
    const sideSecond = getSide(pair.secondPersonId);
    let overlapCount = 0;
    const smallerSide = sideFirst.size <= sideSecond.size ? sideFirst : sideSecond;
    const largerSide = smallerSide === sideFirst ? sideSecond : sideFirst;
    for (const memberId of smallerSide) {
      if (memberId !== pair.firstPersonId && memberId !== pair.secondPersonId && largerSide.has(memberId)) {
        overlapCount += 1;
        break;
      }
    }
    if (overlapCount > 0) {
      continue;
    }
    const firstCount = sideFirst.size;
    const secondCount = sideSecond.size;
    const minorIsFirst = firstCount < secondCount;
    const minorCount = minorIsFirst ? firstCount : secondCount;
    const majorCount = minorIsFirst ? secondCount : firstCount;
    if (majorCount < minorCount * sizeRatioThreshold) {
      continue;
    }
    const minorSpouseId = minorIsFirst ? pair.firstPersonId : pair.secondPersonId;
    const majorSpouseId = minorIsFirst ? pair.secondPersonId : pair.firstPersonId;
    const minorSide = minorIsFirst ? sideFirst : sideSecond;
    let minorHasPrecedence = false;
    for (const memberId of minorSide) {
      if (memberId !== minorSpouseId && shiftedByOtherPair.has(memberId)) {
        minorHasPrecedence = true;
        break;
      }
    }
    if (minorHasPrecedence) {
      continue;
    }
    const anchor = positions.get(minorSpouseId);
    const majorAnchor = positions.get(majorSpouseId);
    if (!anchor || !majorAnchor) {
      continue;
    }
    const anchorX = anchor[0];
    const branchDirection = anchorX >= majorAnchor[0] ? 1 : -1;
    for (const personId of minorSide) {
      if (personId === minorSpouseId) {
        continue;
      }
      const position = positions.get(personId);
      if (!position) {
        continue;
      }
      const [x, y, z] = position;
      const dx = x - anchorX;
      positions.set(personId, [
        anchorX + dx * collapseFactor,
        y,
        z + dx * zProjection + branchDirection * minPerpendicularShift
      ]);
      shiftedByOtherPair.add(personId);
    }
  }
};

type ComponentBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

const computeComponentBounds = (
  component: string[],
  positions: Map<string, NodePosition>
): ComponentBounds => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const personId of component) {
    const position = positions.get(personId);
    if (!position) {
      continue;
    }
    minX = Math.min(minX, position[0]);
    maxX = Math.max(maxX, position[0]);
    minZ = Math.min(minZ, position[2]);
    maxZ = Math.max(maxZ, position[2]);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }
  return { minX, maxX, minZ, maxZ };
};

const separateOverlappingComponents = (components: string[][], positions: Map<string, NodePosition>) => {
  if (components.length < 2) {
    return;
  }
  const paddingX = 3.6;
  const paddingZ = 4.4;
  const boundsArray: ComponentBounds[] = components.map((component) =>
    computeComponentBounds(component, positions)
  );
  const maxPasses = Math.min(24, components.length + 4);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (let firstIndex = 0; firstIndex < components.length; firstIndex += 1) {
      const firstBounds = boundsArray[firstIndex];
      if (!firstBounds) {
        continue;
      }
      for (let secondIndex = firstIndex + 1; secondIndex < components.length; secondIndex += 1) {
        const secondBounds = boundsArray[secondIndex];
        if (!secondBounds) {
          continue;
        }
        const overlapsX =
          firstBounds.minX - paddingX < secondBounds.maxX && secondBounds.minX < firstBounds.maxX + paddingX;
        const overlapsZ =
          firstBounds.minZ - paddingZ < secondBounds.maxZ && secondBounds.minZ < firstBounds.maxZ + paddingZ;
        if (!overlapsX || !overlapsZ) {
          continue;
        }
        const firstCenterX = (firstBounds.minX + firstBounds.maxX) / 2;
        const secondCenterX = (secondBounds.minX + secondBounds.maxX) / 2;
        const firstCenterZ = (firstBounds.minZ + firstBounds.maxZ) / 2;
        const secondCenterZ = (secondBounds.minZ + secondBounds.maxZ) / 2;
        const shiftRight = firstBounds.maxX + paddingX - (secondBounds.minX - paddingX);
        const shiftLeft = secondBounds.maxX + paddingX - (firstBounds.minX - paddingX);
        const shiftForward = firstBounds.maxZ + paddingZ - (secondBounds.minZ - paddingZ);
        const shiftBackward = secondBounds.maxZ + paddingZ - (firstBounds.minZ - paddingZ);
        const shiftX = secondCenterX >= firstCenterX ? Math.max(0, shiftRight) : -Math.max(0, shiftLeft);
        const shiftZ =
          secondCenterZ >= firstCenterZ ? Math.max(0, shiftForward) : -Math.max(0, shiftBackward);
        const preferX =
          Math.abs(shiftX) <= Math.abs(shiftZ) ||
          Math.abs(secondCenterX - firstCenterX) < Math.abs(secondCenterZ - firstCenterZ) * 0.8;
        const appliedShiftX = preferX ? shiftX : 0;
        const appliedShiftZ = preferX ? 0 : shiftZ;
        if (appliedShiftX === 0 && appliedShiftZ === 0) {
          continue;
        }
        const secondComponent = components[secondIndex] ?? [];
        for (const personId of secondComponent) {
          const position = positions.get(personId);
          if (position) {
            positions.set(personId, [position[0] + appliedShiftX, position[1], position[2] + appliedShiftZ]);
          }
        }
        boundsArray[secondIndex] = {
          minX: secondBounds.minX + appliedShiftX,
          maxX: secondBounds.maxX + appliedShiftX,
          minZ: secondBounds.minZ + appliedShiftZ,
          maxZ: secondBounds.maxZ + appliedShiftZ
        };
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
};

const buildTreePositions = <Person extends GenerationTreePerson>(
  people: Person[],
  parentChildEdges: ParentChildEdge[],
  spousePairs: SpousePair[],
  siblingPairs: SiblingPair[],
  primaryFamilyUnitByPersonId: Record<string, string> | undefined,
  layoutPreferences: ResolvedGenerationTreeLayoutPreferences
) => {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const childrenByParent = new Map<string, Set<string>>();
  const parentsByChild = new Map<string, Set<string>>();
  const undirected = new Map<string, Set<string>>();
  for (const person of people) {
    undirected.set(person.id, undirected.get(person.id) ?? new Set());
  }
  for (const edge of parentChildEdges) {
    if (!peopleById.has(edge.parentId) || !peopleById.has(edge.childId)) {
      continue;
    }
    childrenByParent.set(edge.parentId, childrenByParent.get(edge.parentId) ?? new Set());
    childrenByParent.get(edge.parentId)?.add(edge.childId);
    parentsByChild.set(edge.childId, parentsByChild.get(edge.childId) ?? new Set());
    parentsByChild.get(edge.childId)?.add(edge.parentId);
    undirected.get(edge.parentId)?.add(edge.childId);
    undirected.get(edge.childId)?.add(edge.parentId);
  }
  for (const pair of spousePairs) {
    if (!peopleById.has(pair.firstPersonId) || !peopleById.has(pair.secondPersonId)) {
      continue;
    }
    undirected.get(pair.firstPersonId)?.add(pair.secondPersonId);
    undirected.get(pair.secondPersonId)?.add(pair.firstPersonId);
  }
  for (const pair of siblingPairs) {
    if (!peopleById.has(pair.firstPersonId) || !peopleById.has(pair.secondPersonId)) {
      continue;
    }
    undirected.get(pair.firstPersonId)?.add(pair.secondPersonId);
    undirected.get(pair.secondPersonId)?.add(pair.firstPersonId);
  }
  const components = collectConnectedComponents(undirected);
  const positions = new Map<string, NodePosition>();
  const componentCenterByIndex = buildComponentCenters(components, 8, 10);
  const treeTopY = 7;
  const levelStepY = 3.2 * layoutPreferences.verticalSpacing;
  const levelSpacingX = 2.1 * layoutPreferences.horizontalSpacing;
  const coupleGap = 1.8 * layoutPreferences.horizontalSpacing;
  components.forEach((component, componentIndex) => {
    const componentSet = new Set(component);
    const roots = component.filter((personId) => {
      const parents = parentsByChild.get(personId);
      return !parents || [...parents].every((parentId) => !componentSet.has(parentId));
    });
    const depthByPerson = assignDepthsForComponent(
      component,
      componentSet,
      roots.length > 0 ? roots : [component[0]],
      childrenByParent,
      parentsByChild
    );
    normalizeParentChildDepths(componentSet, parentChildEdges, depthByPerson);
    const pedigreeDepthByPerson = new Map(depthByPerson);
    alignCoupleDepths(componentSet, parentChildEdges, spousePairs, parentsByChild, depthByPerson);
    const { units, primaryUnitByChild } = buildFamilyUnitsForComponent(
      component,
      parentsByChild,
      spousePairs,
      peopleById,
      primaryFamilyUnitByPersonId
    );
    const unitDepthByKey = new Map<string, number>();
    for (const unit of units) {
      const depthCandidates = unit.parentIds.map((parentId) => depthByPerson.get(parentId) ?? 0);
      unitDepthByKey.set(unit.key, depthCandidates.length > 0 ? Math.max(...depthCandidates) : 0);
    }
    const unitChildren = buildFamilyUnitTreeEdges(units, primaryUnitByChild);
    const unitXByKey = layoutFamilyUnitTree(
      units,
      unitChildren,
      unitDepthByKey,
      peopleById,
      layoutPreferences
    );
    const visualDepthByPerson = solveVisualDepthsForComponent({
      component,
      componentSet,
      spousePairs,
      siblingPairs,
      parentsByChild,
      units,
      primaryUnitByChild,
      pedigreeDepthByPerson
    });
    const memberUnitsByPerson = new Map<string, FamilyUnit[]>();
    for (const unit of units) {
      for (const parentId of unit.parentIds) {
        const list = memberUnitsByPerson.get(parentId);
        if (list) {
          list.push(unit);
        } else {
          memberUnitsByPerson.set(parentId, [unit]);
        }
      }
    }
    const sortedMemberUnitsByPerson = new Map<string, FamilyUnit[]>();
    for (const [personId, memberUnits] of memberUnitsByPerson.entries()) {
      sortedMemberUnitsByPerson.set(
        personId,
        [...memberUnits].sort((left, right) => {
          const leftDepth = unitDepthByKey.get(left.key) ?? 0;
          const rightDepth = unitDepthByKey.get(right.key) ?? 0;
          return leftDepth !== rightDepth ? leftDepth - rightDepth : left.key.localeCompare(right.key);
        })
      );
    }
    const parentOrderByUnitKey = new Map<string, string[]>();
    for (const unit of units) {
      parentOrderByUnitKey.set(unit.key, sortPersonIdsByName(unit.parentIds, peopleById));
    }
    const [componentCenterX, , componentCenterZ] = componentCenterByIndex.get(componentIndex) ?? [0, 0, 0];
    for (const personId of component) {
      const memberUnits = sortedMemberUnitsByPerson.get(personId) ?? [];
      const anchorUnit = memberUnits[0];
      const personDepth = depthByPerson.get(personId) ?? 0;
      if (!anchorUnit) {
        positions.set(personId, [componentCenterX, treeTopY - personDepth * levelStepY, componentCenterZ]);
        continue;
      }
      const unitX = unitXByKey.get(anchorUnit.key) ?? 0;
      const parentOrder = parentOrderByUnitKey.get(anchorUnit.key) ?? anchorUnit.parentIds;
      let personX = unitX;
      if (parentOrder.length === 2) {
        if (parentOrder[0] === personId) {
          personX = unitX - coupleGap / 2;
        } else if (parentOrder[1] === personId) {
          personX = unitX + coupleGap / 2;
        }
      }
      const visualPersonDepth = visualDepthByPerson.get(personId) ?? personDepth;
      positions.set(personId, [
        componentCenterX + personX * levelSpacingX,
        treeTopY - visualPersonDepth * levelStepY,
        componentCenterZ
      ]);
    }
    applyPerpendicularMinorSpouseBranches(
      component,
      spousePairs,
      parentsByChild,
      childrenByParent,
      positions,
      layoutPreferences
    );
  });
  separateOverlappingComponents(components, positions);
  return positions;
};

const staircaseStep = {
  x: 0.9,
  y: -0.32,
  z: 1.05
} as const;

const buildStaircaseOffsetsById = <Person extends GenerationTreePerson>(
  items: Array<PositionedGenerationTreePerson<Person>>
) => {
  const roundedLevels = [...new Set(items.map((item) => item.position[1].toFixed(3)))]
    .map((value) => Number.parseFloat(value))
    .sort((left, right) => right - left);
  const levelIndexByY = new Map<number, number>();
  roundedLevels.forEach((level, index) => levelIndexByY.set(level, index));
  const offsetsById = new Map<string, NodePosition>();
  items.forEach((item) => {
    const roundedY = Number.parseFloat(item.position[1].toFixed(3));
    const depthIndex = levelIndexByY.get(roundedY) ?? 0;
    offsetsById.set(item.person.id, [
      depthIndex * staircaseStep.x,
      depthIndex * staircaseStep.y,
      depthIndex * staircaseStep.z
    ]);
  });
  return offsetsById;
};

const applyStaircaseOffsets = <Person extends GenerationTreePerson>(
  items: Array<PositionedGenerationTreePerson<Person>>,
  offsetsById: Map<string, NodePosition>,
  scale = 1
): Array<PositionedGenerationTreePerson<Person>> =>
  items.map((item) => {
    const offset = offsetsById.get(item.person.id) ?? [0, 0, 0];
    return {
      person: item.person,
      position: [
        item.position[0] + offset[0] * scale,
        item.position[1] + offset[1] * scale,
        item.position[2] + offset[2] * scale
      ]
    };
  });

const toGenerationTreePositions = <Person extends GenerationTreePerson>(
  items: Array<PositionedGenerationTreePerson<Person>>,
  layoutPreferences: ResolvedGenerationTreeLayoutPreferences
): Array<PositionedGenerationTreePerson<Person>> => {
  if (items.length === 0) {
    return items;
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    minX = Math.min(minX, item.position[0]);
    maxX = Math.max(maxX, item.position[0]);
    minZ = Math.min(minZ, item.position[2]);
    maxZ = Math.max(maxZ, item.position[2]);
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return items.map((item) => ({
    person: item.person,
    position: [
      (item.position[0] - centerX) * 1.12,
      item.position[1] * 1.35 * layoutPreferences.verticalSpacing,
      (item.position[2] - centerZ) * 1.1
    ]
  }));
};

export const positionGenerationTreePeople = <Person extends GenerationTreePerson>(
  people: Person[],
  relationships: readonly GenerationTreeRelationship[],
  options?: {
    primaryFamilyUnitByPersonId?: Record<string, string>;
    treeLayoutPreferences?: GenerationTreeLayoutPreferences;
  }
): Array<PositionedGenerationTreePerson<Person>> => {
  const layoutPreferences = resolveGenerationTreeLayoutPreferences(options?.treeLayoutPreferences);
  const { edges: parentChildEdges } = buildParentChildIndex(relationships);
  const spousePairs = deriveSpousePairs(relationships);
  const siblingPairs = deriveSiblingPairs(relationships);
  const treePositions = buildTreePositions(
    people,
    parentChildEdges,
    spousePairs,
    siblingPairs,
    options?.primaryFamilyUnitByPersonId,
    layoutPreferences
  );
  const withoutTreePosition = people.filter((person) => !treePositions.has(person.id));
  const connectedPeople = people.filter((person) => treePositions.has(person.id));
  const clustersByLastName = withoutTreePosition.reduce<Map<string, Person[]>>((acc, person) => {
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
  const staircaseOffsetsById = buildStaircaseOffsetsById(familyPositions);
  return toGenerationTreePositions(
    applyStaircaseOffsets(familyPositions, staircaseOffsetsById),
    layoutPreferences
  );
};
