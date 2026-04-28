/**
 * @file Suggest likely missing edges (e.g. parents) from graph structure heuristics.
 */

import type { Person, RelationshipRecord, RelationshipType } from "../../lib/api";
import { buildParentChildIndex } from "./layout";

export type RelationshipSuggestion = {
  key: string;
  personId: string;
  personName: string;
  suggestedType: RelationshipType;
  reason: string;
};

const getSortedPair = (firstPersonId: string, secondPersonId: string) =>
  firstPersonId < secondPersonId ? [firstPersonId, secondPersonId] : [secondPersonId, firstPersonId];

const getSiblingKey = (firstPersonId: string, secondPersonId: string) => {
  const [leftId, rightId] = getSortedPair(firstPersonId, secondPersonId);
  return `sibling:${leftId}:${rightId}`;
};

const getSpouseKey = (firstPersonId: string, secondPersonId: string) => {
  const [leftId, rightId] = getSortedPair(firstPersonId, secondPersonId);
  return `spouse:${leftId}:${rightId}`;
};

const getParentChildKey = (parentId: string, childId: string) => `parent:${parentId}:${childId}`;

const hasParentChildConnection = (
  parentsByChild: Map<string, Set<string>>,
  parentId: string,
  childId: string
) => parentsByChild.get(childId)?.has(parentId) ?? false;

const buildSymmetricPairSet = (relationships: RelationshipRecord[], type: RelationshipType) => {
  const pairs = new Set<string>();
  for (const relationship of relationships) {
    if (relationship.type !== type || relationship.fromPersonId === relationship.toPersonId) {
      continue;
    }
    const [leftId, rightId] = getSortedPair(relationship.fromPersonId, relationship.toPersonId);
    pairs.add(`${leftId}|${rightId}`);
  }
  return pairs;
};

const getSymmetricPairLookupKey = (firstPersonId: string, secondPersonId: string) => {
  const [leftId, rightId] = getSortedPair(firstPersonId, secondPersonId);
  return `${leftId}|${rightId}`;
};

const getPairPartnersForPerson = (pairKeys: Set<string>, personId: string) => {
  const relatedIds = new Set<string>();
  for (const pairKey of pairKeys) {
    const [leftId, rightId] = pairKey.split("|");
    if (leftId === personId && rightId) {
      relatedIds.add(rightId);
    } else if (rightId === personId && leftId) {
      relatedIds.add(leftId);
    }
  }
  return relatedIds;
};

const addSuggestion = (
  suggestionsByKey: Map<string, RelationshipSuggestion>,
  dismissedKeys: Set<string>,
  peopleById: Map<string, Person>,
  suggestion: Omit<RelationshipSuggestion, "personName">
) => {
  if (dismissedKeys.has(suggestion.key) || suggestionsByKey.has(suggestion.key)) {
    return;
  }

  const relatedPerson = peopleById.get(suggestion.personId);
  if (!relatedPerson) {
    return;
  }

  suggestionsByKey.set(suggestion.key, {
    ...suggestion,
    personName: relatedPerson.name
  });
};

const siblingReason = (sharedParentNames: string[]) => {
  if (sharedParentNames.length === 1) {
    return `Both are children of ${sharedParentNames[0]}.`;
  }
  if (sharedParentNames.length === 2) {
    return `Both are children of ${sharedParentNames[0]} and ${sharedParentNames[1]}.`;
  }
  return `They share parents: ${sharedParentNames.join(", ")}.`;
};

const parentReason = (parentName: string, siblingName: string) =>
  `${parentName} is already a parent of sibling ${siblingName}.`;

const spouseReason = (sharedChildNames: string[]) => {
  if (sharedChildNames.length === 1) {
    return `Both are parents of ${sharedChildNames[0]}.`;
  }
  if (sharedChildNames.length === 2) {
    return `Both are parents of ${sharedChildNames[0]} and ${sharedChildNames[1]}.`;
  }
  return `They share children: ${sharedChildNames.join(", ")}.`;
};

const spousesChildReason = (spouseName: string, childName: string) =>
  `${childName} is already connected as a child of spouse ${spouseName}.`;

const compareSuggestions = (left: RelationshipSuggestion, right: RelationshipSuggestion) =>
  left.personName.localeCompare(right.personName) ||
  left.suggestedType.localeCompare(right.suggestedType) ||
  left.personId.localeCompare(right.personId) ||
  left.key.localeCompare(right.key);

export const getSuggestionRelationshipLabel = (relationshipType: RelationshipType) => {
  if (relationshipType === "CHILD_OF") {
    return "Parent";
  }
  if (relationshipType === "PARENT_OF") {
    return "Child";
  }
  if (relationshipType === "SPOUSE_OF") {
    return "Spouse";
  }
  if (relationshipType === "FRIEND_OF") {
    return "Friend";
  }
  if (relationshipType === "PET_OF") {
    return "Pet";
  }
  return "Sibling";
};

export const computeSuggestions = (
  selectedPersonId: string,
  people: Person[],
  relationships: RelationshipRecord[],
  dismissedKeys: string[]
): RelationshipSuggestion[] => {
  const peopleById = new Map(people.map((entry) => [entry.id, entry]));
  if (!peopleById.has(selectedPersonId)) {
    return [];
  }

  const dismissedKeySet = new Set(dismissedKeys);
  const { parentsByChild, childrenByParent } = buildParentChildIndex(relationships);
  const siblingPairs = buildSymmetricPairSet(relationships, "SIBLING_OF");
  const spousePairs = buildSymmetricPairSet(relationships, "SPOUSE_OF");
  const suggestionsByKey = new Map<string, RelationshipSuggestion>();

  const selectedParents = [...(parentsByChild.get(selectedPersonId) ?? new Set<string>())];
  const siblingParentIdsBySibling = new Map<string, Set<string>>();
  for (const parentId of selectedParents) {
    const siblingIds = childrenByParent.get(parentId) ?? new Set<string>();
    for (const siblingId of siblingIds) {
      if (siblingId === selectedPersonId) {
        continue;
      }

      const siblingParents = siblingParentIdsBySibling.get(siblingId) ?? new Set<string>();
      siblingParents.add(parentId);
      siblingParentIdsBySibling.set(siblingId, siblingParents);
    }
  }

  for (const [siblingId, sharedParentIds] of siblingParentIdsBySibling) {
    if (siblingPairs.has(getSymmetricPairLookupKey(selectedPersonId, siblingId))) {
      continue;
    }

    const sharedParentNames = [...sharedParentIds]
      .map((parentId) => peopleById.get(parentId)?.name)
      .filter((name): name is string => Boolean(name))
      .sort((left, right) => left.localeCompare(right));

    addSuggestion(suggestionsByKey, dismissedKeySet, peopleById, {
      key: getSiblingKey(selectedPersonId, siblingId),
      personId: siblingId,
      suggestedType: "SIBLING_OF",
      reason: siblingReason(sharedParentNames)
    });
  }

  const siblingIdsForParentSuggestions = new Set<string>([
    ...siblingParentIdsBySibling.keys(),
    ...getPairPartnersForPerson(siblingPairs, selectedPersonId)
  ]);
  for (const siblingId of siblingIdsForParentSuggestions) {
    const siblingParents = parentsByChild.get(siblingId) ?? new Set<string>();
    for (const parentId of siblingParents) {
      if (
        parentId === selectedPersonId ||
        hasParentChildConnection(parentsByChild, parentId, selectedPersonId)
      ) {
        continue;
      }

      const siblingName = peopleById.get(siblingId)?.name ?? "their sibling";
      const parentName = peopleById.get(parentId)?.name ?? "This person";

      addSuggestion(suggestionsByKey, dismissedKeySet, peopleById, {
        key: getParentChildKey(parentId, selectedPersonId),
        personId: parentId,
        suggestedType: "CHILD_OF",
        reason: parentReason(parentName, siblingName)
      });
    }
  }

  const selectedChildren = [...(childrenByParent.get(selectedPersonId) ?? new Set<string>())];
  const coparentChildIdsByPerson = new Map<string, Set<string>>();
  for (const childId of selectedChildren) {
    const childParents = parentsByChild.get(childId) ?? new Set<string>();
    for (const parentId of childParents) {
      if (parentId === selectedPersonId) {
        continue;
      }

      const childIds = coparentChildIdsByPerson.get(parentId) ?? new Set<string>();
      childIds.add(childId);
      coparentChildIdsByPerson.set(parentId, childIds);
    }
  }

  for (const [coparentId, sharedChildIds] of coparentChildIdsByPerson) {
    if (spousePairs.has(getSymmetricPairLookupKey(selectedPersonId, coparentId))) {
      continue;
    }

    const sharedChildNames = [...sharedChildIds]
      .map((childId) => peopleById.get(childId)?.name)
      .filter((name): name is string => Boolean(name))
      .sort((left, right) => left.localeCompare(right));

    addSuggestion(suggestionsByKey, dismissedKeySet, peopleById, {
      key: getSpouseKey(selectedPersonId, coparentId),
      personId: coparentId,
      suggestedType: "SPOUSE_OF",
      reason: spouseReason(sharedChildNames)
    });
  }

  for (const spousePairKey of spousePairs) {
    const [leftId, rightId] = spousePairKey.split("|");
    const spouseId = leftId === selectedPersonId ? rightId : rightId === selectedPersonId ? leftId : null;
    if (!spouseId) {
      continue;
    }

    const spouseChildren = childrenByParent.get(spouseId) ?? new Set<string>();
    for (const childId of spouseChildren) {
      if (
        childId === selectedPersonId ||
        hasParentChildConnection(parentsByChild, selectedPersonId, childId)
      ) {
        continue;
      }

      const spouseName = peopleById.get(spouseId)?.name ?? "their spouse";
      const childName = peopleById.get(childId)?.name ?? "This person";
      const key = getParentChildKey(selectedPersonId, childId);

      addSuggestion(suggestionsByKey, dismissedKeySet, peopleById, {
        key,
        personId: childId,
        suggestedType: "PARENT_OF",
        reason: spousesChildReason(spouseName, childName)
      });
    }
  }

  return [...suggestionsByKey.values()].sort(compareSuggestions);
};
