/**
 * @file Family-tree layout math: familyTreeBuildPositions.
 */

import type { Person } from "../../../lib/api";
import type { NodePosition } from "./types";
import { collectConnectedComponents, buildComponentCenters } from "./familyTreeComponents";
import { assignDepthsForComponent, alignCoupleDepths, normalizeParentChildDepths } from "./familyTreeDepths";
import { layoutFamilyUnitTree } from "./familyTreeBuchheimLayout";
import { separateOverlappingComponents } from "./familyTreeOverlap";
import { applyPerpendicularMinorSpouseBranches } from "./familyTreeSpouseBranches";
import { sortPersonIdsByName } from "./familyTreeNaming";
import { buildFamilyUnitTreeEdges, buildFamilyUnitsForComponent, type FamilyUnit } from "./familyTreeUnits";
import { solveVisualDepthsForComponent } from "./familyTreeVisualRows";
import type { ParentChildEdge, SiblingPair, SpousePair } from "./familyTreeTypes";

export const buildTreePositions = (
  people: Person[],
  parentChildEdges: ParentChildEdge[],
  spousePairs: SpousePair[],
  siblingPairs: SiblingPair[],
  primaryFamilyUnitByPersonId?: Record<string, string>
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
    if (!childrenByParent.has(edge.parentId)) {
      childrenByParent.set(edge.parentId, new Set());
    }
    childrenByParent.get(edge.parentId)?.add(edge.childId);
    if (!parentsByChild.has(edge.childId)) {
      parentsByChild.set(edge.childId, new Set());
    }
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
  const levelStepY = 3.2;
  const levelSpacingX = 2.1;
  const coupleGap = 1.8;

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
    const unitXByKey = layoutFamilyUnitTree(units, unitChildren, unitDepthByKey, peopleById);
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
          if (leftDepth !== rightDepth) {
            return leftDepth - rightDepth;
          }
          return left.key.localeCompare(right.key);
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
      positions
    );
  });

  separateOverlappingComponents(components, positions);
  return positions;
};
