import type { ImmichPerson, PhotoCluster, RelationshipRecord } from "../../../lib/api";
import type { GraphLayoutMode, NodePosition } from "./types";
import { buildParentChildIndex, getLastNameKey, hashToNumber } from "./graphPrimitives";
import { buildTreePositions, deriveSiblingPairs, deriveSpousePairs } from "./familyTreeCore";
import { positionPeopleByPhotoClusters } from "./photoLayout";
import { buildStaircaseOffsetsById, applyStaircaseOffsets, toGenerationTreePositions } from "./generationTransforms";

export const positionPeople = (
  people: ImmichPerson[],
  relationships: RelationshipRecord[],
  options?: {
    mode?: GraphLayoutMode;
    photoClusters?: PhotoCluster[];
    primaryFamilyUnitByPersonId?: Record<string, string>;
  }
) => {
  if (options?.mode === "photo") {
    return positionPeopleByPhotoClusters(people, options.photoClusters ?? []);
  }

  const { edges: parentChildEdges } = buildParentChildIndex(relationships);
  const spousePairs = deriveSpousePairs(relationships);
  const siblingPairs = deriveSiblingPairs(relationships);
  const treePositions = buildTreePositions(
    people,
    parentChildEdges,
    spousePairs,
    siblingPairs,
    options?.primaryFamilyUnitByPersonId
  );
  const withoutTreePosition = people.filter((person) => !treePositions.has(person.id));
  const connectedPeople = people.filter((person) => treePositions.has(person.id));

  const clustersByLastName = withoutTreePosition.reduce<Map<string, ImmichPerson[]>>((acc, person) => {
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
  const staircaseFamilyPositions = applyStaircaseOffsets(familyPositions, staircaseOffsetsById);

  return toGenerationTreePositions(staircaseFamilyPositions);
};
