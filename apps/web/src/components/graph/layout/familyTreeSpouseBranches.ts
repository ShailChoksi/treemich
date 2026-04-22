/**
 * @file Family-tree layout math: familyTreeSpouseBranches.
 */

import type { NodePosition } from "./types";
import type { SpousePair } from "./familyTreeTypes";

// When one spouse has a much smaller ancestor/sibling side than their partner,
// rotate that smaller side into a perpendicular plane. The minor spouse stays
// where Buchheim placed them (anchored to the couple); everyone on their side
// has their X-displacement collapsed and re-projected into Z, so the minor
// family ends up tucked in front of or behind the major family instead of
// stretching horizontally alongside it.
//
// This used to do two full component BFSes per spouse pair (O(P·V)), which
// slowed layout noticeably on large graphs. The current implementation does
// bounded ancestor walks plus memoized per-person "family side" closures, so
// the total work is roughly O(V · avg_side) with an early-exit fast path for
// the common case where a partner has no visible ancestors.
export const applyPerpendicularMinorSpouseBranches = (
  component: string[],
  spousePairs: SpousePair[],
  parentsByChild: Map<string, Set<string>>,
  childrenByParent: Map<string, Set<string>>,
  positions: Map<string, NodePosition>
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
    if (!spouseAdjacency.has(pair.firstPersonId)) {
      spouseAdjacency.set(pair.firstPersonId, new Set());
    }
    if (!spouseAdjacency.has(pair.secondPersonId)) {
      spouseAdjacency.set(pair.secondPersonId, new Set());
    }
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

  const sizeRatioThreshold = 1.5;
  const collapseFactor = 0.35;
  const zProjection = 1.6;
  const minPerpendicularShift = 3.4;
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
