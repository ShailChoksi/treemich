/**
 * @file Family-tree layout math: visual row solver.
 */

import type { SiblingPair, SpousePair } from "./familyTreeTypes";
import type { FamilyUnit } from "./familyTreeUnits";

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

type ChildVisualConstraint = {
  childId: string;
  parentIds: string[];
  skipWhenSpouseFromCompressedParentUnit: boolean;
};

type SpouseVisualConstraint = {
  firstPersonId: string;
  secondPersonId: string;
  firstHasParents: boolean;
  secondHasParents: boolean;
  firstHasCompressedParentUnit: boolean;
  secondHasCompressedParentUnit: boolean;
  hasCompressedDepthGap: boolean;
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

export const solveVisualDepthsForComponent = ({
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
  const childConstraints: ChildVisualConstraint[] = [];
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

  const spouseConstraints: SpouseVisualConstraint[] = componentSpousePairs.map((pair) => {
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
      if (constraint.skipWhenSpouseFromCompressedParentUnit) {
        continue;
      }
      changed = setVisualDepth(constraint.childId, getMaxVisualDepth(constraint.parentIds) + 1) || changed;
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
