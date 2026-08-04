/**
 * @packageDocumentation
 * Focus mode membership: Bloodline cone + siblings of Bloodline people +
 * collateral descendants of those siblings + spouses of everyone included.
 */

export type FocusMembershipOptions = {
  anchorId: string | null;
  ancestorDepth: number;
  descendantDepth: number;
  collateralDepth: number;
};

/** Minimal relationship edge shape for Focus membership (avoids circular imports). */
export type FocusMembershipEdge = {
  fromPersonId: string;
  toPersonId: string;
  type: string;
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

const buildParentChildIndex = (relationships: FocusMembershipEdge[]) => {
  const parentsByChild = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    let parentId: string | null = null;
    let childId: string | null = null;
    if (relationship.type === "PARENT_OF") {
      parentId = relationship.fromPersonId;
      childId = relationship.toPersonId;
    } else if (relationship.type === "CHILD_OF") {
      parentId = relationship.toPersonId;
      childId = relationship.fromPersonId;
    }
    if (!parentId || !childId) {
      continue;
    }
    const existingParents = parentsByChild.get(childId);
    if (existingParents) {
      existingParents.add(parentId);
    } else {
      parentsByChild.set(childId, new Set([parentId]));
    }
    const existingChildren = childrenByParent.get(parentId);
    if (existingChildren) {
      existingChildren.add(childId);
    } else {
      childrenByParent.set(parentId, new Set([childId]));
    }
  }
  return { parentsByChild, childrenByParent };
};

const buildSiblingIndex = (relationships: FocusMembershipEdge[]): Map<string, Set<string>> => {
  const siblingsByPerson = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    if (relationship.type !== "SIBLING_OF") {
      continue;
    }
    const { fromPersonId, toPersonId } = relationship;
    if (fromPersonId === toPersonId) {
      continue;
    }
    const existingFrom = siblingsByPerson.get(fromPersonId);
    if (existingFrom) {
      existingFrom.add(toPersonId);
    } else {
      siblingsByPerson.set(fromPersonId, new Set([toPersonId]));
    }
    const existingTo = siblingsByPerson.get(toPersonId);
    if (existingTo) {
      existingTo.add(fromPersonId);
    } else {
      siblingsByPerson.set(toPersonId, new Set([fromPersonId]));
    }
  }
  return siblingsByPerson;
};

const buildSpouseIndex = (relationships: FocusMembershipEdge[]): Map<string, Set<string>> => {
  const spousesByPerson = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    if (relationship.type !== "SPOUSE_OF") {
      continue;
    }
    const { fromPersonId, toPersonId } = relationship;
    if (fromPersonId === toPersonId) {
      continue;
    }
    const existingFrom = spousesByPerson.get(fromPersonId);
    if (existingFrom) {
      existingFrom.add(toPersonId);
    } else {
      spousesByPerson.set(fromPersonId, new Set([toPersonId]));
    }
    const existingTo = spousesByPerson.get(toPersonId);
    if (existingTo) {
      existingTo.add(fromPersonId);
    } else {
      spousesByPerson.set(toPersonId, new Set([fromPersonId]));
    }
  }
  return spousesByPerson;
};

/**
 * Returns person ids in Focus membership for the given anchor and depths.
 * Empty when there is no Focus Anchor.
 */
export const pickFocusMembershipIds = (
  relationships: FocusMembershipEdge[],
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
