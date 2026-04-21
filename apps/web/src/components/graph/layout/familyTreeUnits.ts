import type { ImmichPerson } from "../../../lib/api";
import { sortPersonIdsByName } from "./familyTreeNaming";
import type { SpousePair } from "./familyTreeTypes";

export type FamilyUnit = {
  key: string;
  parentIds: string[];
  childIds: Set<string>;
};

/** Stable key for a parent set. Person ids must not contain "|" — keys are split on "|" when building merged parent lines. */
const familyUnitKeyFromParents = (parentIds: string[]) => [...parentIds].sort().join("|");

const enumerateCandidateUnitKeys = (parentIds: string[], peopleById: Map<string, ImmichPerson>) => {
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
      if (!secondId) {
        continue;
      }
      keys.push(familyUnitKeyFromParents([firstId, secondId]));
    }
  }
  return keys;
};

const resolvePrimaryUnitByChild = (
  component: string[],
  parentsByChild: Map<string, Set<string>>,
  peopleById: Map<string, ImmichPerson>,
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
    if (preferred && candidates.includes(preferred)) {
      primaryByChild.set(childId, preferred);
      continue;
    }
    primaryByChild.set(childId, candidates[0] as string);
  }
  return primaryByChild;
};

export const buildFamilyUnitsForComponent = (
  component: string[],
  parentsByChild: Map<string, Set<string>>,
  spousePairs: SpousePair[],
  peopleById: Map<string, ImmichPerson>,
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
    if (parentIds.length === 0) {
      continue;
    }
    ensureUnit(unitKey, parentIds).childIds.add(childId);
  }

  for (const pair of spousePairs) {
    if (!componentSet.has(pair.firstPersonId) || !componentSet.has(pair.secondPersonId)) {
      continue;
    }
    const parentIds = sortPersonIdsByName([pair.firstPersonId, pair.secondPersonId], peopleById);
    const key = familyUnitKeyFromParents(parentIds);
    ensureUnit(key, parentIds);
  }

  const parentMembershipCount = new Map<string, number>();
  for (const unit of unitsByKey.values()) {
    for (const parentId of unit.parentIds) {
      parentMembershipCount.set(parentId, (parentMembershipCount.get(parentId) ?? 0) + 1);
    }
  }
  for (const personId of component) {
    if ((parentMembershipCount.get(personId) ?? 0) > 0) {
      continue;
    }
    const key = familyUnitKeyFromParents([personId]);
    ensureUnit(key, [personId]);
  }

  return {
    units: [...unitsByKey.values()],
    primaryUnitByChild
  };
};

export const buildFamilyUnitTreeEdges = (units: FamilyUnit[], primaryUnitByChild: Map<string, string>) => {
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
      if (childParentUnitKey === parentUnitKey || !unitSet.has(childParentUnitKey)) {
        continue;
      }
      childrenByUnit.get(parentUnitKey)?.add(childParentUnitKey);
    }
  }
  return childrenByUnit;
};
