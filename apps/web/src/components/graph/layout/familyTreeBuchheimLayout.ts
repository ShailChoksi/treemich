/**
 * @file Family-tree layout math: familyTreeBuchheimLayout.
 */

import type { Person } from "../../../lib/api";
import { personNameById } from "./familyTreeNaming";
import type { FamilyUnit } from "./familyTreeUnits";

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

export const layoutFamilyUnitTree = (
  units: FamilyUnit[],
  childrenByUnit: Map<string, Set<string>>,
  unitDepthByKey: Map<string, number>,
  peopleById: Map<string, Person>
) => {
  const personRadius = 0.72;
  const coupleGap = 1.9;
  const siblingSeparation = 0.9;
  const subtreeSeparation = 1.5;
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
    if (siblingIndex <= 0) {
      return null;
    }
    return siblings[siblingIndex - 1] ?? null;
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
    const span = Math.max(0, maxRightSpan(root));
    forestOffset = span + 2.5;
    minX = Number.POSITIVE_INFINITY;
  }

  const xByUnit = new Map<string, number>();
  for (const node of nodeById.values()) {
    xByUnit.set(node.id, node.x);
  }
  return xByUnit;
};
