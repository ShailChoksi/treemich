/**
 * @file Family-tree layout math: familyTreeDepths.
 */

import type { ParentChildEdge, SpousePair } from "./familyTreeTypes";

export const assignDepthsForComponent = (
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

export const normalizeParentChildDepths = (
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
      const parentDepth = depthByPerson.get(edge.parentId) ?? 0;
      const childDepth = depthByPerson.get(edge.childId) ?? 0;
      const requiredChildDepth = parentDepth + 1;
      if (childDepth >= requiredChildDepth) {
        continue;
      }
      depthByPerson.set(edge.childId, requiredChildDepth);
      changed = true;
    }
    if (!changed) {
      break;
    }
  }
};

export const alignCoupleDepths = (
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
          if (hasInComponentParents(parentId)) {
            continue;
          }
          changed = alignPersonDepth(parentId, aligned) || changed;
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
