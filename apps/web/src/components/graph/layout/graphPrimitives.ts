/**
 * @file Family-tree layout math: graphPrimitives.
 */

import { inverseRelationshipType as inverseRelationshipTypeShared } from "@treemich/shared";
import type { RelationshipRecord, RelationshipType } from "../../../lib/api";
import type { DirectionalNeighborBuckets, NodePosition } from "./types";

type ParentChildEdge = { parentId: string; childId: string };

export const inverseRelationshipType = (type: RelationshipType): RelationshipType =>
  inverseRelationshipTypeShared(type);

export const hashToNumber = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

export const getLastNameKey = (fullName: string) => {
  const normalized = fullName.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return "_unknown";
  }
  const parts = normalized.split(" ");
  const lastName = parts.at(-1);
  if (!lastName || parts.length < 2) {
    return "_unknown";
  }
  return lastName;
};

export const subtractPosition = (point: NodePosition, offset: NodePosition): NodePosition => [
  point[0] - offset[0],
  point[1] - offset[1],
  point[2] - offset[2]
];

export const distanceSquared = (a: NodePosition, b: NodePosition) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

export const buildParentChildIndex = (relationships: RelationshipRecord[]) => {
  const edges = new Map<string, ParentChildEdge>();
  const parentsByChild = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    let edge: ParentChildEdge | null = null;
    if (relationship.type === "PARENT_OF") {
      edge = {
        parentId: relationship.fromPersonId,
        childId: relationship.toPersonId
      };
    } else if (relationship.type === "CHILD_OF") {
      edge = {
        parentId: relationship.toPersonId,
        childId: relationship.fromPersonId
      };
    }
    if (!edge) {
      continue;
    }

    edges.set(`${edge.parentId}->${edge.childId}`, edge);

    const existingParents = parentsByChild.get(edge.childId);
    if (existingParents) {
      existingParents.add(edge.parentId);
    } else {
      parentsByChild.set(edge.childId, new Set([edge.parentId]));
    }

    const existingChildren = childrenByParent.get(edge.parentId);
    if (existingChildren) {
      existingChildren.add(edge.childId);
    } else {
      childrenByParent.set(edge.parentId, new Set([edge.childId]));
    }
  }
  return {
    edges: [...edges.values()],
    parentsByChild,
    childrenByParent
  };
};

export const buildDirectionalNeighborBuckets = (
  selectedPersonId: string,
  relationships: RelationshipRecord[]
): DirectionalNeighborBuckets => {
  const up = new Set<string>();
  const down = new Set<string>();
  const side = new Set<string>();

  for (const relationship of relationships) {
    if (relationship.type === "PARENT_OF") {
      if (relationship.toPersonId === selectedPersonId) {
        up.add(relationship.fromPersonId);
      } else if (relationship.fromPersonId === selectedPersonId) {
        down.add(relationship.toPersonId);
      }
      continue;
    }

    if (relationship.type === "CHILD_OF") {
      if (relationship.fromPersonId === selectedPersonId) {
        up.add(relationship.toPersonId);
      } else if (relationship.toPersonId === selectedPersonId) {
        down.add(relationship.fromPersonId);
      }
      continue;
    }

    if (relationship.fromPersonId === selectedPersonId && relationship.toPersonId !== selectedPersonId) {
      side.add(relationship.toPersonId);
      continue;
    }

    if (relationship.toPersonId === selectedPersonId && relationship.fromPersonId !== selectedPersonId) {
      side.add(relationship.fromPersonId);
    }
  }

  return {
    up: [...up],
    down: [...down],
    side: [...side]
  };
};
