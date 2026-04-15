import type { ImmichAssetPeople } from "../integrations/immich/client.js";

export type PhotoCooccurrenceEdge = {
  personAId: string;
  personBId: string;
  sharedPhotos: number;
  score: number;
};

export type PhotoCluster = {
  id: string;
  personIds: string[];
  size: number;
};

export type PhotoCooccurrenceResult = {
  clusters: PhotoCluster[];
  edges: PhotoCooccurrenceEdge[];
  computedAt: string;
  sourcePhotoCount: number;
};

export type BuildPhotoCooccurrenceOptions = {
  minSharedPhotos: number;
  minScore: number;
};

export type PhotoCooccurrenceStats = {
  sourcePhotoCount: number;
  personPhotoCounts: Map<string, number>;
  pairSharedCounts: Map<string, number>;
};

const incrementMapValue = (map: Map<string, number>, key: string, by = 1) => {
  map.set(key, (map.get(key) ?? 0) + by);
};

const pairKeyFor = (firstPersonId: string, secondPersonId: string) =>
  [firstPersonId, secondPersonId].sort().join("|");

export const buildPhotoCooccurrenceStats = (assets: ImmichAssetPeople[]): PhotoCooccurrenceStats => {
  const personPhotoCounts = new Map<string, number>();
  const pairSharedCounts = new Map<string, number>();

  for (const asset of assets) {
    const uniquePeople = [...new Set(asset.personIds)];
    for (const personId of uniquePeople) {
      incrementMapValue(personPhotoCounts, personId);
    }

    for (let index = 0; index < uniquePeople.length; index += 1) {
      const firstPersonId = uniquePeople[index];
      if (!firstPersonId) {
        continue;
      }
      for (let nextIndex = index + 1; nextIndex < uniquePeople.length; nextIndex += 1) {
        const secondPersonId = uniquePeople[nextIndex];
        if (!secondPersonId) {
          continue;
        }
        incrementMapValue(pairSharedCounts, pairKeyFor(firstPersonId, secondPersonId));
      }
    }
  }

  return {
    sourcePhotoCount: assets.length,
    personPhotoCounts,
    pairSharedCounts
  };
};

export const buildPhotoCooccurrenceResult = (
  stats: PhotoCooccurrenceStats,
  options: BuildPhotoCooccurrenceOptions
): PhotoCooccurrenceResult => {
  const clampedMinSharedPhotos = Math.max(1, Math.trunc(options.minSharedPhotos));
  const clampedMinScore = Math.max(0, Math.min(1, options.minScore));

  const edges: PhotoCooccurrenceEdge[] = [];
  for (const [key, sharedPhotos] of stats.pairSharedCounts) {
    if (sharedPhotos < clampedMinSharedPhotos) {
      continue;
    }

    const [personAId, personBId] = key.split("|");
    if (!personAId || !personBId) {
      continue;
    }

    const firstCount = stats.personPhotoCounts.get(personAId) ?? 0;
    const secondCount = stats.personPhotoCounts.get(personBId) ?? 0;
    const denominator = Math.max(1, Math.min(firstCount, secondCount));
    const score = sharedPhotos / denominator;
    if (score < clampedMinScore) {
      continue;
    }
    edges.push({
      personAId,
      personBId,
      sharedPhotos,
      score: Math.round(score * 1000) / 1000
    });
  }

  edges.sort(
    (left, right) =>
      right.sharedPhotos - left.sharedPhotos ||
      right.score - left.score ||
      left.personAId.localeCompare(right.personAId) ||
      left.personBId.localeCompare(right.personBId)
  );

  const allPersonIds = [...stats.personPhotoCounts.keys()].sort();
  const adjacency = new Map(allPersonIds.map((personId) => [personId, new Set<string>()]));
  for (const edge of edges) {
    adjacency.get(edge.personAId)?.add(edge.personBId);
    adjacency.get(edge.personBId)?.add(edge.personAId);
  }

  const visited = new Set<string>();
  const clusters: PhotoCluster[] = [];
  for (const startId of allPersonIds) {
    if (visited.has(startId)) {
      continue;
    }
    const stack = [startId];
    visited.add(startId);
    const personIds: string[] = [];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      personIds.push(current);
      for (const adjacent of adjacency.get(current) ?? []) {
        if (visited.has(adjacent)) {
          continue;
        }
        visited.add(adjacent);
        stack.push(adjacent);
      }
    }
    personIds.sort();
    clusters.push({
      id: `cluster-${personIds[0] ?? clusters.length + 1}`,
      personIds,
      size: personIds.length
    });
  }

  clusters.sort((left, right) => right.size - left.size || left.id.localeCompare(right.id));

  return {
    clusters,
    edges,
    computedAt: new Date().toISOString(),
    sourcePhotoCount: stats.sourcePhotoCount
  };
};
