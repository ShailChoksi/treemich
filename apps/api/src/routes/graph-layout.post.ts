/**
 * @file Registers `POST /graph/layout` — server-side 3D layout with small in-memory revision cache.
 */

import {
  buildGraphLayoutRevision,
  type GraphLayoutPersonInput,
  graphLayoutRequestSchema,
  type GraphLayoutRequest,
  type GraphLayoutResponse,
  relationshipTypeSchema,
  type RelationshipType
} from "@treemich/shared";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";

const CACHE_MAX_ENTRIES = 32;
const ALGORITHM_VERSION = "server-hybrid-v1";
const TOPOLOGY_TYPES = new Set<RelationshipType>([
  relationshipTypeSchema.enum.PARENT_OF,
  relationshipTypeSchema.enum.CHILD_OF,
  relationshipTypeSchema.enum.SPOUSE_OF
]);

type LayoutCacheEntry = {
  value: GraphLayoutResponse;
};

const layoutCache = new Map<string, LayoutCacheEntry>();

const touchCacheEntry = (cacheKey: string, entry: LayoutCacheEntry) => {
  layoutCache.delete(cacheKey);
  layoutCache.set(cacheKey, entry);
};

const upsertCacheEntry = (cacheKey: string, entry: LayoutCacheEntry) => {
  layoutCache.delete(cacheKey);
  layoutCache.set(cacheKey, entry);
  while (layoutCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = layoutCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    layoutCache.delete(oldestKey);
  }
};

const getOrCreateSet = (index: Map<string, Set<string>>, key: string) => {
  const current = index.get(key);
  if (current) {
    return current;
  }
  const created = new Set<string>();
  index.set(key, created);
  return created;
};

const collectTopologyRelationships = (relationships: GraphLayoutRequest["relationships"]) =>
  relationships.filter((relationship) => TOPOLOGY_TYPES.has(relationship.type));

const buildUndirectedAdjacency = (
  people: GraphLayoutPersonInput[],
  relationships: GraphLayoutRequest["relationships"]
) => {
  const adjacency = new Map<string, Set<string>>();
  for (const person of people) {
    adjacency.set(person.id, new Set<string>());
  }
  for (const relationship of collectTopologyRelationships(relationships)) {
    if (relationship.fromPersonId === relationship.toPersonId) {
      continue;
    }
    getOrCreateSet(adjacency, relationship.fromPersonId).add(relationship.toPersonId);
    getOrCreateSet(adjacency, relationship.toPersonId).add(relationship.fromPersonId);
  }
  return adjacency;
};

const buildFamilyIndexes = (relationships: GraphLayoutRequest["relationships"]) => {
  const parentsByChild = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, Set<string>>();
  const spouseByPerson = new Map<string, Set<string>>();

  for (const relationship of collectTopologyRelationships(relationships)) {
    if (relationship.type === relationshipTypeSchema.enum.SPOUSE_OF) {
      getOrCreateSet(spouseByPerson, relationship.fromPersonId).add(relationship.toPersonId);
      getOrCreateSet(spouseByPerson, relationship.toPersonId).add(relationship.fromPersonId);
      continue;
    }
    const parentId =
      relationship.type === relationshipTypeSchema.enum.PARENT_OF
        ? relationship.fromPersonId
        : relationship.toPersonId;
    const childId =
      relationship.type === relationshipTypeSchema.enum.PARENT_OF
        ? relationship.toPersonId
        : relationship.fromPersonId;
    if (parentId === childId) {
      continue;
    }
    getOrCreateSet(childrenByParent, parentId).add(childId);
    getOrCreateSet(parentsByChild, childId).add(parentId);
  }

  return {
    parentsByChild,
    childrenByParent,
    spouseByPerson
  };
};

const collectComponent = (startId: string, adjacency: Map<string, Set<string>>, visited: Set<string>) => {
  const queue = [startId];
  visited.add(startId);
  const component: string[] = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const personId = queue[cursor]!;
    component.push(personId);
    for (const nextId of adjacency.get(personId) ?? []) {
      if (visited.has(nextId)) {
        continue;
      }
      visited.add(nextId);
      queue.push(nextId);
    }
  }
  return component;
};

const assignDepths = (
  component: string[],
  indexes: ReturnType<typeof buildFamilyIndexes>,
  peopleById: Map<string, GraphLayoutPersonInput>
) => {
  const componentSet = new Set(component);
  const inDegreeById = new Map<string, number>();
  const depthById = new Map<string, number>();
  for (const personId of component) {
    const parentCount =
      [...(indexes.parentsByChild.get(personId) ?? [])].filter((parentId) => componentSet.has(parentId))
        .length ?? 0;
    inDegreeById.set(personId, parentCount);
  }
  const roots = component
    .filter((personId) => (inDegreeById.get(personId) ?? 0) === 0)
    .sort((left, right) =>
      (peopleById.get(left)?.name ?? left).localeCompare(peopleById.get(right)?.name ?? right)
    );
  const queue = roots.length > 0 ? [...roots] : [...component];
  for (const rootId of queue) {
    depthById.set(rootId, 0);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parentId = queue[cursor]!;
    const parentDepth = depthById.get(parentId) ?? 0;
    for (const childId of indexes.childrenByParent.get(parentId) ?? []) {
      if (!componentSet.has(childId)) {
        continue;
      }
      const candidateDepth = parentDepth + 1;
      const currentDepth = depthById.get(childId);
      if (currentDepth === undefined || candidateDepth > currentDepth) {
        depthById.set(childId, candidateDepth);
      }
      const nextInDegree = (inDegreeById.get(childId) ?? 0) - 1;
      inDegreeById.set(childId, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(childId);
      }
    }
  }

  for (const personId of component) {
    if (!depthById.has(personId)) {
      depthById.set(personId, 0);
    }
  }
  return depthById;
};

const computePositionsByPersonId = (request: GraphLayoutRequest) => {
  const peopleById = new Map(request.people.map((person) => [person.id, person]));
  const adjacency = buildUndirectedAdjacency(request.people, request.relationships);
  const indexes = buildFamilyIndexes(request.relationships);
  const visited = new Set<string>();
  const positionsByPersonId: GraphLayoutResponse["positionsByPersonId"] = {};
  const anchorOrder = request.selectedPersonId ? [request.selectedPersonId] : [];
  const peopleOrder = [
    ...anchorOrder,
    ...request.people.map((person) => person.id).filter((personId) => !anchorOrder.includes(personId))
  ];
  let componentOffsetX = 0;
  let componentOffsetZ = 0;

  for (const personId of peopleOrder) {
    if (visited.has(personId)) {
      continue;
    }
    const component = collectComponent(personId, adjacency, visited);
    const depthById = assignDepths(component, indexes, peopleById);
    const layers = new Map<number, string[]>();
    for (const memberId of component) {
      const depth = depthById.get(memberId) ?? 0;
      const current = layers.get(depth) ?? [];
      current.push(memberId);
      layers.set(depth, current);
    }

    const sortedDepths = [...layers.keys()].sort((left, right) => left - right);
    let widestLayer = 1;
    for (const depth of sortedDepths) {
      const layer = layers.get(depth) ?? [];
      layer.sort((left, right) =>
        (peopleById.get(left)?.name ?? left).localeCompare(peopleById.get(right)?.name ?? right)
      );
      widestLayer = Math.max(widestLayer, layer.length);
      const centerIndex = (layer.length - 1) / 2;
      for (let index = 0; index < layer.length; index += 1) {
        const memberId = layer[index]!;
        const x = componentOffsetX + (index - centerIndex) * 4;
        const y = -(depth * 4);
        const z = componentOffsetZ;
        positionsByPersonId[memberId] = [x, y, z];
      }
    }

    componentOffsetX += Math.max(16, widestLayer * 5);
    if (componentOffsetX > 120) {
      componentOffsetX = 0;
      componentOffsetZ += 24;
    }
  }

  return positionsByPersonId;
};

export const registerGraphLayoutPostRoute = (app: FastifyInstance) => {
  app.post("/graph/layout", async (request) => {
    const auth = getRequiredAuth(request);
    const body = graphLayoutRequestSchema.parse(request.body);
    const layoutRevision = buildGraphLayoutRevision(body);
    const cacheKey = `${auth.user.id}:${layoutRevision}:${ALGORITHM_VERSION}`;
    const cacheEntry = layoutCache.get(cacheKey);
    if (cacheEntry) {
      touchCacheEntry(cacheKey, {
        value: cacheEntry.value
      });
      return cacheEntry.value;
    }

    const positionsByPersonId = computePositionsByPersonId(body);
    const response = {
      layoutRevision,
      algorithmVersion: ALGORITHM_VERSION,
      positionsByPersonId
    } satisfies GraphLayoutResponse;
    upsertCacheEntry(cacheKey, {
      value: response
    });
    return response;
  });
};
