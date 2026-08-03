/**
 * Focus mode membership: Bloodline cone + siblings of Bloodline people +
 * collateral descendants of those siblings + spouses of everyone included.
 */

import type { RelationshipRecord } from "../../lib/api";
import { buildSiblingIndex, buildSpouseIndex } from "./extendedFamily";
import { buildParentChildIndex } from "./layout";

export type FocusMembershipOptions = {
  anchorId: string | null;
  ancestorDepth: number;
  descendantDepth: number;
  collateralDepth: number;
};

const walkGenerations = (
  startIds: Iterable<string>,
  adjacency: Map<string, Set<string>>,
  maxDepth: number
): Set<string> => {
  const reached = new Set<string>();
  if (maxDepth < 0) {
    return reached;
  }
  let frontier = new Set<string>(startIds);
  for (const id of frontier) {
    reached.add(id);
  }
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (reached.has(neighbor)) {
          continue;
        }
        reached.add(neighbor);
        next.add(neighbor);
      }
    }
    if (next.size === 0) {
      break;
    }
    frontier = next;
  }
  return reached;
};

const sharedParentSiblings = (
  personId: string,
  parentsByChild: Map<string, Set<string>>,
  childrenByParent: Map<string, Set<string>>
): Set<string> => {
  const siblings = new Set<string>();
  for (const parentId of parentsByChild.get(personId) ?? []) {
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (childId !== personId) {
        siblings.add(childId);
      }
    }
  }
  return siblings;
};

/**
 * Returns person ids in Focus membership for the given anchor and depths.
 * Empty when there is no Focus Anchor.
 */
export const pickFocusMembershipIds = (
  relationships: RelationshipRecord[],
  options: FocusMembershipOptions
): Set<string> => {
  const { anchorId, ancestorDepth, descendantDepth, collateralDepth } = options;
  if (!anchorId) {
    return new Set();
  }

  const { parentsByChild, childrenByParent } = buildParentChildIndex(relationships);
  const siblingsByPerson = buildSiblingIndex(relationships);
  const spousesByPerson = buildSpouseIndex(relationships);

  const ancestors = walkGenerations([anchorId], parentsByChild, Math.max(0, ancestorDepth));
  const descendants = walkGenerations([anchorId], childrenByParent, Math.max(0, descendantDepth));
  const bloodline = new Set<string>([anchorId, ...ancestors, ...descendants]);

  const bloodlineSiblings = new Set<string>();
  for (const personId of bloodline) {
    for (const siblingId of siblingsByPerson.get(personId) ?? []) {
      if (!bloodline.has(siblingId)) {
        bloodlineSiblings.add(siblingId);
      }
    }
    for (const siblingId of sharedParentSiblings(personId, parentsByChild, childrenByParent)) {
      if (!bloodline.has(siblingId)) {
        bloodlineSiblings.add(siblingId);
      }
    }
  }

  const membership = new Set<string>([...bloodline, ...bloodlineSiblings]);

  const collateralDepthClamped = Math.max(0, collateralDepth);
  if (collateralDepthClamped > 0) {
    for (const siblingId of bloodlineSiblings) {
      const collateral = walkGenerations([siblingId], childrenByParent, collateralDepthClamped);
      for (const id of collateral) {
        if (id !== siblingId) {
          membership.add(id);
        }
      }
    }
  }

  for (const personId of [...membership]) {
    for (const spouseId of spousesByPerson.get(personId) ?? []) {
      membership.add(spouseId);
    }
  }

  return membership;
};
