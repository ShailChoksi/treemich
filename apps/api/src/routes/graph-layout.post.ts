/**
 * @file Registers `POST /graph/layout` — server-side 3D layout with small in-memory revision cache.
 */

import {
  buildGraphLayoutRevision,
  graphLayoutRequestSchema,
  type GraphLayoutRequest,
  type GraphLayoutResponse,
  positionGenerationTreePeople,
  relationshipTypeSchema,
  type RelationshipType
} from "@treemich/shared";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";

const CACHE_MAX_ENTRIES = 32;
const MAX_GRAPH_LAYOUT_PEOPLE = 5_000;
const MAX_GRAPH_LAYOUT_RELATIONSHIPS = 10_000;
const ALGORITHM_VERSION = "server-generation-tree-v2";
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

const collectTopologyRelationships = (relationships: GraphLayoutRequest["relationships"]) =>
  relationships.filter((relationship) => TOPOLOGY_TYPES.has(relationship.type));

const computePositionsByPersonId = (request: GraphLayoutRequest) => {
  const positionsByPersonId: GraphLayoutResponse["positionsByPersonId"] = {};
  for (const entry of positionGenerationTreePeople(
    request.people,
    collectTopologyRelationships(request.relationships),
    {
      primaryFamilyUnitByPersonId: request.primaryFamilyUnitByPersonId,
      treeLayoutPreferences: request.treeLayoutPreferences
    }
  )) {
    positionsByPersonId[entry.person.id] = entry.position;
  }
  return positionsByPersonId;
};

export const registerGraphLayoutPostRoute = (app: FastifyInstance) => {
  app.post("/graph/layout", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const body = graphLayoutRequestSchema.parse(request.body);
    if (
      body.people.length > MAX_GRAPH_LAYOUT_PEOPLE ||
      body.relationships.length > MAX_GRAPH_LAYOUT_RELATIONSHIPS
    ) {
      return reply.code(413).send({
        statusCode: 413,
        error: "Graph Too Large",
        message: `Graph layout supports up to ${MAX_GRAPH_LAYOUT_PEOPLE} people and ${MAX_GRAPH_LAYOUT_RELATIONSHIPS} relationships per request.`
      });
    }
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
