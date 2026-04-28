import { CooccurrenceJobStatus, PrismaClient, type Prisma } from "@prisma/client";
import type {
  CooccurrenceEdgeRecord,
  CooccurrenceJobResponse,
  CooccurrenceScheduleInfo,
  PhotoCluster,
  PhotoCooccurrenceResponse
} from "@treemich/shared";
import { prisma } from "../db/client.js";
import type { ImmichClient } from "../integrations/immich/client.js";
import type { ImmichAssetPeople } from "../integrations/immich/client.js";
import {
  buildPhotoCooccurrenceResult,
  buildPhotoCooccurrenceStats,
  type BuildPhotoCooccurrenceOptions
} from "../relationships/cooccurrence.js";
import { getCooccurrencePreferences, parseUserPreferences } from "../preferences.js";

/** Photo cooccurrence aggregation and scheduling; pair scoring lives in `relationships/cooccurrence`. */

const insertBatchSize = 1000;
const defaultPageSize = 100;
const maxPageSize = 2000;
const maxClusterEdges = 10_000;
const maxPersistedResponseEdges = 5_000;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

type CooccurrenceServiceOptions = {
  prismaClient?: PrismaClient;
  runBackgroundTask?: (task: () => Promise<void>) => void;
  now?: () => Date;
};

type QueryEdgesOptions = {
  cursor?: string;
  limit?: number;
  minSharedPhotos?: number;
  minScore?: number;
  personId?: string;
};

type DueSchedule = Awaited<ReturnType<CooccurrenceService["getDueSchedules"]>>[number];

const addDays = (value: Date, days: number) => new Date(value.getTime() + days * millisecondsPerDay);

const normalizePair = (personAId: string, personBId: string) =>
  [personAId, personBId].sort((left, right) => left.localeCompare(right)) as [string, string];

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");

const toIsoStringOrNull = (value?: Date | null) => value?.toISOString() ?? null;

const isMissingCooccurrenceScheduleTableError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const prismaError = error as { code?: unknown; meta?: unknown };
  if (prismaError.code !== "P2021") {
    return false;
  }

  const table = (prismaError.meta as { table?: unknown } | undefined)?.table;
  return table === "public.CooccurrenceSchedule";
};

const buildScheduleInfo = (
  schedule: { enabled: boolean; intervalDays: number; nextRunAt: Date; lastRunAt: Date | null } | null,
  preferences: ReturnType<typeof getCooccurrencePreferences>
): CooccurrenceScheduleInfo => ({
  refreshEnabled: schedule?.enabled ?? preferences.refreshEnabled,
  refreshIntervalDays: schedule?.intervalDays ?? preferences.refreshIntervalDays,
  nextRunAt: toIsoStringOrNull(schedule?.nextRunAt),
  lastRunAt: toIsoStringOrNull(schedule?.lastRunAt)
});

const buildClustersFromEdges = (edges: Array<{ personAId: string; personBId: string }>): PhotoCluster[] => {
  const allPersonIds = [...new Set(edges.flatMap((edge) => [edge.personAId, edge.personBId]))].sort();
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

  return clusters.sort((left, right) => right.size - left.size || left.id.localeCompare(right.id));
};

export class CooccurrenceConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "CooccurrenceConflictError";
  }
}

export class CooccurrenceService {
  private readonly prismaClient: PrismaClient;
  private readonly runBackgroundTask: (task: () => Promise<void>) => void;
  private readonly now: () => Date;

  constructor(options: CooccurrenceServiceOptions = {}) {
    this.prismaClient = options.prismaClient ?? prisma;
    this.runBackgroundTask =
      options.runBackgroundTask ??
      ((task) => {
        setImmediate(() => {
          void task();
        });
      });
    this.now = options.now ?? (() => new Date());
  }

  private async getUserCooccurrencePreferences(userId: string) {
    const user = await this.prismaClient.treemichUser.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true }
    });

    return getCooccurrencePreferences(parseUserPreferences(user.preferences));
  }

  private buildPersistedEdges(
    userId: string,
    stats: ReturnType<typeof buildPhotoCooccurrenceStats>,
    computedAt: Date,
    options?: { sourceProvider?: "IMMICH"; sourceMetadata?: Record<string, unknown> }
  ) {
    const rows: Array<{
      userId: string;
      personAId: string;
      personBId: string;
      sharedPhotos: number;
      score: number;
      personAPhotoCount: number;
      personBPhotoCount: number;
      computedAt: Date;
      sourceProvider?: "IMMICH";
      sourceImportedAt?: Date;
      sourceMetadata?: Prisma.InputJsonValue;
    }> = [];

    for (const [key, sharedPhotos] of stats.pairSharedCounts.entries()) {
      const [firstPersonId, secondPersonId] = key.split("|");
      if (!firstPersonId || !secondPersonId) {
        continue;
      }

      const [personAId, personBId] = normalizePair(firstPersonId, secondPersonId);
      const personAPhotoCount = stats.personPhotoCounts.get(personAId) ?? 0;
      const personBPhotoCount = stats.personPhotoCounts.get(personBId) ?? 0;
      const denominator = Math.max(1, Math.min(personAPhotoCount, personBPhotoCount));
      const score = Math.round((sharedPhotos / denominator) * 1000) / 1000;

      rows.push({
        userId,
        personAId,
        personBId,
        sharedPhotos,
        score,
        personAPhotoCount,
        personBPhotoCount,
        computedAt,
        ...(options?.sourceProvider
          ? {
              sourceProvider: options.sourceProvider,
              sourceImportedAt: computedAt,
              sourceMetadata: (options.sourceMetadata ?? {}) as Prisma.InputJsonValue
            }
          : {})
      });
    }

    rows.sort(
      (left, right) =>
        right.sharedPhotos - left.sharedPhotos ||
        right.score - left.score ||
        left.personAId.localeCompare(right.personAId) ||
        left.personBId.localeCompare(right.personBId)
    );

    return rows;
  }

  private async mapImmichAssetsToTreemichPeople(userId: string, assets: ImmichAssetPeople[]) {
    const providerPersonIds = [
      ...new Set(assets.flatMap((asset) => asset.personIds).filter((personId) => personId.trim().length > 0))
    ];
    if (providerPersonIds.length === 0) {
      return {
        mappedAssets: [] as ImmichAssetPeople[],
        linkedImmichPersonCount: 0,
        skippedImmichPersonCount: 0
      };
    }

    const identities = await this.prismaClient.personExternalIdentity.findMany({
      where: {
        userId,
        provider: "IMMICH",
        providerPersonId: { in: providerPersonIds }
      },
      select: { providerPersonId: true, personId: true }
    });

    const personIdByImmichId = new Map<string, string>();
    for (const identity of identities) {
      personIdByImmichId.set(identity.providerPersonId, identity.personId);
    }

    const mappedAssets = assets
      .map((asset) => ({
        assetId: asset.assetId,
        personIds: [
          ...new Set(
            asset.personIds
              .map((providerPersonId) => personIdByImmichId.get(providerPersonId))
              .filter((personId): personId is string => Boolean(personId))
          )
        ]
      }))
      .filter((asset) => asset.personIds.length > 0);

    return {
      mappedAssets,
      linkedImmichPersonCount: personIdByImmichId.size,
      skippedImmichPersonCount: providerPersonIds.length - personIdByImmichId.size
    };
  }

  private async executeComputation(jobId: string, userId: string, immichClient: ImmichClient) {
    const startedAt = this.now();
    await this.prismaClient.cooccurrenceJob.update({
      where: { id: jobId },
      data: {
        status: CooccurrenceJobStatus.RUNNING,
        startedAt,
        progress: 0.1,
        errorMessage: null
      }
    });

    try {
      const assets = await immichClient.listAssetsWithPeople();
      const mapped = await this.mapImmichAssetsToTreemichPeople(userId, assets);
      const stats = buildPhotoCooccurrenceStats(mapped.mappedAssets);
      const computedAt = this.now();
      const rows = this.buildPersistedEdges(userId, stats, computedAt, {
        sourceProvider: "IMMICH",
        sourceMetadata: {
          sourceAssetCount: assets.length,
          mappedAssetCount: mapped.mappedAssets.length,
          linkedImmichPersonCount: mapped.linkedImmichPersonCount,
          skippedImmichPersonCount: mapped.skippedImmichPersonCount
        }
      });

      await this.prismaClient.cooccurrenceEdge.deleteMany({
        where: { userId }
      });

      for (let index = 0; index < rows.length; index += insertBatchSize) {
        const batch = rows.slice(index, index + insertBatchSize);
        if (batch.length === 0) {
          continue;
        }

        await this.prismaClient.cooccurrenceEdge.createMany({
          data: batch
        });
      }

      await this.prismaClient.cooccurrenceJob.update({
        where: { id: jobId },
        data: {
          status: CooccurrenceJobStatus.COMPLETED,
          sourcePhotoCount: assets.length,
          edgeCount: rows.length,
          progress: 1,
          completedAt: computedAt,
          errorMessage: null
        }
      });
    } catch (error) {
      await this.prismaClient.cooccurrenceJob.update({
        where: { id: jobId },
        data: {
          status: CooccurrenceJobStatus.FAILED,
          errorMessage: toErrorMessage(error),
          progress: null
        }
      });
    }
  }

  async ensureSchedule(userId: string, now = this.now()) {
    const existing = await this.prismaClient.cooccurrenceSchedule.findUnique({
      where: { userId }
    });
    if (existing) {
      return existing;
    }

    const preferences = await this.getUserCooccurrencePreferences(userId);
    return this.prismaClient.cooccurrenceSchedule.create({
      data: {
        userId,
        enabled: preferences.refreshEnabled,
        intervalDays: preferences.refreshIntervalDays,
        nextRunAt: addDays(now, preferences.refreshIntervalDays)
      }
    });
  }

  async syncScheduleFromPreferences(userId: string, now = this.now()) {
    const preferences = await this.getUserCooccurrencePreferences(userId);
    const existing = await this.prismaClient.cooccurrenceSchedule.findUnique({
      where: { userId }
    });

    const baseDate = existing?.lastRunAt ?? now;
    const nextRunAt = addDays(baseDate, preferences.refreshIntervalDays);

    if (existing) {
      return this.prismaClient.cooccurrenceSchedule.update({
        where: { userId },
        data: {
          enabled: preferences.refreshEnabled,
          intervalDays: preferences.refreshIntervalDays,
          nextRunAt
        }
      });
    }

    return this.prismaClient.cooccurrenceSchedule.create({
      data: {
        userId,
        enabled: preferences.refreshEnabled,
        intervalDays: preferences.refreshIntervalDays,
        nextRunAt
      }
    });
  }

  async advanceSchedule(userId: string, now = this.now()) {
    const schedule = await this.ensureSchedule(userId, now);
    return this.prismaClient.cooccurrenceSchedule.update({
      where: { userId },
      data: {
        lastRunAt: now,
        nextRunAt: addDays(now, schedule.intervalDays)
      }
    });
  }

  async triggerComputation(userId: string, immichClient: ImmichClient) {
    const runningJob = await this.prismaClient.cooccurrenceJob.findFirst({
      where: {
        userId,
        status: CooccurrenceJobStatus.RUNNING
      },
      select: { id: true }
    });
    if (runningJob) {
      throw new CooccurrenceConflictError("A co-occurrence computation is already running");
    }

    await this.ensureSchedule(userId);
    await this.advanceSchedule(userId);

    const job = await this.prismaClient.cooccurrenceJob.create({
      data: {
        userId,
        status: CooccurrenceJobStatus.PENDING
      }
    });

    this.runBackgroundTask(async () => {
      await this.executeComputation(job.id, userId, immichClient);
    });

    return job;
  }

  async getDueSchedules(now = this.now(), limit = 25) {
    try {
      return await this.prismaClient.cooccurrenceSchedule.findMany({
        where: {
          enabled: true,
          nextRunAt: {
            lte: now
          }
        },
        include: {
          user: {
            include: {
              linkedAccount: true
            }
          }
        },
        orderBy: {
          nextRunAt: "asc"
        },
        take: limit
      });
    } catch (error) {
      if (isMissingCooccurrenceScheduleTableError(error)) {
        return [];
      }
      throw error;
    }
  }

  async getStatus(userId: string): Promise<CooccurrenceJobResponse> {
    const [job, schedule, preferences] = await Promise.all([
      this.prismaClient.cooccurrenceJob.findFirst({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.prismaClient.cooccurrenceSchedule.findUnique({
        where: { userId }
      }),
      this.getUserCooccurrencePreferences(userId)
    ]);

    return {
      job: job
        ? {
            id: job.id,
            status: job.status,
            sourcePhotoCount: job.sourcePhotoCount,
            edgeCount: job.edgeCount,
            progress: job.progress,
            errorMessage: job.errorMessage,
            startedAt: toIsoStringOrNull(job.startedAt),
            completedAt: toIsoStringOrNull(job.completedAt),
            createdAt: job.createdAt.toISOString(),
            updatedAt: job.updatedAt.toISOString()
          }
        : null,
      schedule: buildScheduleInfo(schedule, preferences)
    };
  }

  async queryEdges(userId: string, options: QueryEdgesOptions = {}) {
    const limit = Math.max(1, Math.min(options.limit ?? defaultPageSize, maxPageSize));
    const rows = await this.prismaClient.cooccurrenceEdge.findMany({
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1
          }
        : {}),
      where: {
        userId,
        ...(options.minSharedPhotos !== undefined ? { sharedPhotos: { gte: options.minSharedPhotos } } : {}),
        ...(options.minScore !== undefined ? { score: { gte: options.minScore } } : {}),
        ...(options.personId
          ? {
              OR: [{ personAId: options.personId }, { personBId: options.personId }]
            }
          : {})
      },
      orderBy: { id: "asc" },
      take: limit + 1
    });

    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = pageItems[pageItems.length - 1];

    return {
      edges: pageItems.map<CooccurrenceEdgeRecord>((row) => ({
        id: row.id,
        personAId: row.personAId,
        personBId: row.personBId,
        sourceProvider: row.sourceProvider,
        sourceImportedAt: toIsoStringOrNull(row.sourceImportedAt),
        sourceMetadata:
          row.sourceMetadata != null &&
          typeof row.sourceMetadata === "object" &&
          !Array.isArray(row.sourceMetadata)
            ? (row.sourceMetadata as Record<string, unknown>)
            : {},
        sharedPhotos: row.sharedPhotos,
        score: row.score,
        personAPhotoCount: row.personAPhotoCount,
        personBPhotoCount: row.personBPhotoCount,
        computedAt: row.computedAt.toISOString()
      })),
      nextCursor: hasMore && lastItem ? lastItem.id : null
    };
  }

  async getEdgeBetween(userId: string, personAId: string, personBId: string) {
    const [normalizedA, normalizedB] = normalizePair(personAId, personBId);
    const row = await this.prismaClient.cooccurrenceEdge.findUnique({
      where: {
        userId_personAId_personBId: {
          userId,
          personAId: normalizedA,
          personBId: normalizedB
        }
      }
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      personAId: row.personAId,
      personBId: row.personBId,
      sourceProvider: row.sourceProvider,
      sourceImportedAt: toIsoStringOrNull(row.sourceImportedAt),
      sourceMetadata:
        row.sourceMetadata != null &&
        typeof row.sourceMetadata === "object" &&
        !Array.isArray(row.sourceMetadata)
          ? (row.sourceMetadata as Record<string, unknown>)
          : {},
      sharedPhotos: row.sharedPhotos,
      score: row.score,
      personAPhotoCount: row.personAPhotoCount,
      personBPhotoCount: row.personBPhotoCount,
      computedAt: row.computedAt.toISOString()
    } satisfies CooccurrenceEdgeRecord;
  }

  async getClusters(userId: string, options: Omit<QueryEdgesOptions, "cursor" | "limit"> = {}) {
    const rows = await this.prismaClient.cooccurrenceEdge.findMany({
      where: {
        userId,
        ...(options.minSharedPhotos !== undefined ? { sharedPhotos: { gte: options.minSharedPhotos } } : {}),
        ...(options.minScore !== undefined ? { score: { gte: options.minScore } } : {}),
        ...(options.personId
          ? {
              OR: [{ personAId: options.personId }, { personBId: options.personId }]
            }
          : {})
      },
      orderBy: [{ sharedPhotos: "desc" }, { score: "desc" }, { id: "asc" }],
      take: maxClusterEdges
    });

    return buildClustersFromEdges(rows);
  }

  async getPersistedPhotoCooccurrence(
    userId: string,
    options: BuildPhotoCooccurrenceOptions
  ): Promise<PhotoCooccurrenceResponse | null> {
    const latestCompletedJob = await this.prismaClient.cooccurrenceJob.findFirst({
      where: {
        userId,
        status: CooccurrenceJobStatus.COMPLETED
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }]
    });

    if (!latestCompletedJob) {
      return null;
    }

    const rows = await this.prismaClient.cooccurrenceEdge.findMany({
      where: {
        userId,
        sharedPhotos: { gte: Math.max(1, Math.trunc(options.minSharedPhotos)) },
        score: { gte: Math.max(0, Math.min(1, options.minScore)) }
      },
      orderBy: [{ sharedPhotos: "desc" }, { score: "desc" }, { id: "asc" }],
      take: maxPersistedResponseEdges
    });

    const personPhotoCounts = new Map<string, number>();
    const pairSharedCounts = new Map<string, number>();

    for (const row of rows) {
      personPhotoCounts.set(
        row.personAId,
        Math.max(personPhotoCounts.get(row.personAId) ?? 0, row.personAPhotoCount)
      );
      personPhotoCounts.set(
        row.personBId,
        Math.max(personPhotoCounts.get(row.personBId) ?? 0, row.personBPhotoCount)
      );
      pairSharedCounts.set(`${row.personAId}|${row.personBId}`, row.sharedPhotos);
    }

    const result = buildPhotoCooccurrenceResult(
      {
        sourcePhotoCount: latestCompletedJob.sourcePhotoCount ?? 0,
        personPhotoCounts,
        pairSharedCounts
      },
      options
    );

    return {
      ...result,
      computedAt: latestCompletedJob.completedAt?.toISOString() ?? result.computedAt
    };
  }
}

export type { DueSchedule, QueryEdgesOptions };
