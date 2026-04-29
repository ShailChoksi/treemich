import {
  FamilyChildPedigree,
  Gender,
  Prisma,
  RelationshipType,
  type PersonProfile,
  type Relationship
} from "@prisma/client";
import { inverseRelationshipType, type RelationshipType as SharedRelationshipType } from "@treemich/shared";
import { prisma } from "../db/client.js";
import type { ImmichClient } from "../integrations/immich/client.js";
import type { LifeEventService } from "../lifeEvents/service.js";
import {
  buildPhotoCooccurrenceResult,
  buildPhotoCooccurrenceStats,
  type BuildPhotoCooccurrenceOptions,
  type PhotoCooccurrenceResult,
  type PhotoCooccurrenceStats
} from "./cooccurrence.js";

type DbClient = Prisma.TransactionClient | typeof prisma;
const personIdChunkSize = 500;

export class RelationshipService {
  constructor(private readonly lifeEventService: LifeEventService) {}

  private readonly photoCooccurrenceCacheTtlMs = 90_000;
  private readonly maxPhotoCooccurrenceCacheEntries = 100;
  private readonly photoCooccurrenceStatsCache = new Map<
    string,
    {
      expiresAt: number;
      stats: PhotoCooccurrenceStats;
    }
  >();

  private evictExpiredPhotoCooccurrenceStats(now: number) {
    for (const [userId, entry] of this.photoCooccurrenceStatsCache.entries()) {
      if (entry.expiresAt > now) {
        continue;
      }

      this.photoCooccurrenceStatsCache.delete(userId);
    }
  }

  private evictOverflowPhotoCooccurrenceStats() {
    while (this.photoCooccurrenceStatsCache.size > this.maxPhotoCooccurrenceCacheEntries) {
      const oldestUserId = this.photoCooccurrenceStatsCache.keys().next().value;
      if (!oldestUserId) {
        break;
      }

      this.photoCooccurrenceStatsCache.delete(oldestUserId);
    }
  }

  async upsertProfile(
    userId: string,
    personId: string,
    profile: {
      gender?: Gender;
      givenName?: string | null;
      surname?: string | null;
      nicknames?: string | null;
    },
    db: DbClient = prisma
  ): Promise<PersonProfile> {
    const existing =
      (await db.personProfile.findFirst({ where: { id: personId, userId } })) ??
      (
        await db.personExternalIdentity.findFirst({
          where: { userId, providerPersonId: personId },
          include: { person: true }
        })
      )?.person ??
      null;

    if (existing) {
      return db.personProfile.update({
        where: { id: existing.id },
        data: {
          ...(profile.gender !== undefined ? { gender: profile.gender } : {}),
          ...(profile.givenName !== undefined ? { givenName: profile.givenName } : {}),
          ...(profile.surname !== undefined ? { surname: profile.surname } : {}),
          ...(profile.nicknames !== undefined ? { nicknames: profile.nicknames } : {})
        }
      });
    }

    return db.personProfile.create({
      data: {
        userId,
        ...(profile.gender !== undefined ? { gender: profile.gender } : {}),
        ...(profile.givenName !== undefined ? { givenName: profile.givenName } : {}),
        ...(profile.surname !== undefined ? { surname: profile.surname } : {}),
        ...(profile.nicknames !== undefined ? { nicknames: profile.nicknames } : {})
      }
    });
  }

  async upsertRelationship(
    userId: string,
    fromPersonId: string,
    toPersonId: string,
    relationshipType: RelationshipType,
    options?: { familyId?: string | null; db?: DbClient }
  ): Promise<{ direct: Relationship; inverse: Relationship }> {
    const inverseType = inverseRelationshipType(
      relationshipType as SharedRelationshipType
    ) as RelationshipType;
    const isParentChildEdge = relationshipType === "PARENT_OF" || relationshipType === "CHILD_OF";
    const storedFamilyId = isParentChildEdge ? (options?.familyId ?? null) : null;
    const shouldWriteFamilyIdColumn =
      isParentChildEdge && options != null && Object.prototype.hasOwnProperty.call(options, "familyId");

    const run = async (tx: DbClient) => {
      const fromProfile = await this.upsertProfile(userId, fromPersonId, {}, tx);
      const toProfile = await this.upsertProfile(userId, toPersonId, {}, tx);
      const canonicalFromPersonId = fromProfile.id;
      const canonicalToPersonId = toProfile.id;

      const directUpdate = shouldWriteFamilyIdColumn ? { familyId: storedFamilyId } : {};

      const direct = await tx.relationship.upsert({
        where: {
          userId_fromPersonId_toPersonId_type: {
            userId,
            fromPersonId: canonicalFromPersonId,
            toPersonId: canonicalToPersonId,
            type: relationshipType
          }
        },
        update: directUpdate,
        create: {
          userId,
          fromPersonId: canonicalFromPersonId,
          toPersonId: canonicalToPersonId,
          type: relationshipType,
          ...(shouldWriteFamilyIdColumn ? { familyId: storedFamilyId } : {})
        }
      });

      const inverseUpdate = shouldWriteFamilyIdColumn ? { familyId: storedFamilyId } : {};

      const inverse = await tx.relationship.upsert({
        where: {
          userId_fromPersonId_toPersonId_type: {
            userId,
            fromPersonId: canonicalToPersonId,
            toPersonId: canonicalFromPersonId,
            type: inverseType
          }
        },
        update: inverseUpdate,
        create: {
          userId,
          fromPersonId: canonicalToPersonId,
          toPersonId: canonicalFromPersonId,
          type: inverseType,
          ...(shouldWriteFamilyIdColumn ? { familyId: storedFamilyId } : {})
        }
      });

      return { direct, inverse };
    };

    if (options?.db) {
      return run(options.db);
    }

    return prisma.$transaction(async (tx) => run(tx));
  }

  async hasSpouseRelationship(userId: string, fromPersonId: string, toPersonId: string): Promise<boolean> {
    const row = await prisma.relationship.findFirst({
      where: {
        userId,
        type: "SPOUSE_OF",
        OR: [
          { fromPersonId, toPersonId },
          { fromPersonId: toPersonId, toPersonId: fromPersonId }
        ]
      },
      select: { id: true }
    });
    return row != null;
  }

  async findTargetsByRelationship(
    userId: string,
    sourcePersonIds: string[],
    relationshipType: RelationshipType
  ) {
    return prisma.relationship.findMany({
      where: {
        userId,
        toPersonId: { in: sourcePersonIds },
        type: relationshipType
      }
    });
  }

  async traverseRelationshipChain(
    userId: string,
    sourcePersonIds: string[],
    hops: SharedRelationshipType[]
  ): Promise<string[]> {
    let currentIds = sourcePersonIds;
    for (const hop of hops) {
      const rows = await this.findTargetsByRelationship(userId, currentIds, hop as RelationshipType);
      currentIds = [...new Set(rows.map((r) => r.fromPersonId))];
      if (currentIds.length === 0) {
        break;
      }
    }
    const sourceSet = new Set(sourcePersonIds);
    return currentIds.filter((id) => !sourceSet.has(id));
  }

  async getProfilesForPersonIds(userId: string, personIds: string[]) {
    const profiles = await prisma.personProfile.findMany({
      where: {
        userId,
        id: { in: personIds }
      }
    });

    return new Map(profiles.map((profile) => [profile.id, profile]));
  }

  async getConnectedPersonIds(userId: string, personIds: string[]) {
    const connectedIds = new Set<string>();
    if (personIds.length === 0) {
      return connectedIds;
    }

    for (let offset = 0; offset < personIds.length; offset += personIdChunkSize) {
      const chunk = personIds.slice(offset, offset + personIdChunkSize);
      const relationships = await prisma.relationship.findMany({
        where: {
          userId,
          OR: [{ fromPersonId: { in: chunk } }, { toPersonId: { in: chunk } }]
        },
        select: {
          fromPersonId: true,
          toPersonId: true
        }
      });

      for (const relationship of relationships) {
        connectedIds.add(relationship.fromPersonId);
        connectedIds.add(relationship.toPersonId);
      }
    }

    return connectedIds;
  }

  async listRelationships(userId: string, options?: { cursor?: string; limit?: number }) {
    const limit = Math.max(1, Math.min(options?.limit ?? 500, 2000));
    const relationships = await prisma.relationship.findMany({
      ...(options?.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1
          }
        : {}),
      where: {
        userId
      },
      take: limit + 1,
      orderBy: { id: "asc" },
      select: {
        id: true,
        fromPersonId: true,
        toPersonId: true,
        type: true,
        familyId: true
      }
    });

    const hasMore = relationships.length > limit;
    const pageItems = hasMore ? relationships.slice(0, limit) : relationships;
    const lastItem = pageItems[pageItems.length - 1];

    const parentEdges = pageItems.filter((row) => row.type === "PARENT_OF" && row.familyId != null);
    const childPedigreeByRelationshipId = new Map<string, FamilyChildPedigree>();
    if (parentEdges.length > 0) {
      const pairKey = (familyId: string, childId: string) => `${familyId}:${childId}`;
      const rows = await prisma.familyChild.findMany({
        where: {
          OR: parentEdges.map((edge) => ({
            familyId: edge.familyId as string,
            childPersonId: edge.toPersonId
          }))
        },
        select: {
          familyId: true,
          childPersonId: true,
          pedigree: true
        }
      });
      const pedigreeByPair = new Map(
        rows
          .filter((row) => row.childPersonId != null)
          .map((row) => [pairKey(row.familyId, row.childPersonId!), row.pedigree])
      );
      for (const edge of parentEdges) {
        const pedigree = pedigreeByPair.get(pairKey(edge.familyId as string, edge.toPersonId));
        if (pedigree) {
          childPedigreeByRelationshipId.set(edge.id, pedigree);
        }
      }
    }

    const spousePairs = pageItems
      .filter((item) => item.type === "SPOUSE_OF")
      .map((item) => {
        const lo = item.fromPersonId < item.toPersonId ? item.fromPersonId : item.toPersonId;
        const hi = item.fromPersonId < item.toPersonId ? item.toPersonId : item.fromPersonId;
        return { lo, hi };
      });
    const spouseDatesByPair = await this.lifeEventService.getSpouseMarriageDivorceIsoForPairs(
      userId,
      spousePairs
    );

    return {
      relationships: pageItems.map((item) => {
        const base = {
          id: item.id,
          fromPersonId: item.fromPersonId,
          toPersonId: item.toPersonId,
          type: item.type,
          familyId: item.familyId,
          ...(item.type === "PARENT_OF" && childPedigreeByRelationshipId.has(item.id)
            ? { childEdgePedigree: childPedigreeByRelationshipId.get(item.id) }
            : {})
        };
        if (item.type !== "SPOUSE_OF") {
          return base;
        }
        const lo = item.fromPersonId < item.toPersonId ? item.fromPersonId : item.toPersonId;
        const hi = item.fromPersonId < item.toPersonId ? item.toPersonId : item.fromPersonId;
        const dates = spouseDatesByPair.get(`${lo}:${hi}`) ?? {
          marriageAnniversaryDate: null,
          divorceDate: null
        };
        return {
          ...base,
          marriageAnniversaryDate: dates.marriageAnniversaryDate,
          divorceDate: dates.divorceDate
        };
      }),
      nextCursor: hasMore && lastItem ? lastItem.id : null
    };
  }

  async deleteRelationship(
    userId: string,
    fromPersonId: string,
    toPersonId: string,
    relationshipType?: RelationshipType
  ) {
    if (!relationshipType) {
      return prisma.relationship.deleteMany({
        where: {
          userId,
          familyId: null,
          OR: [
            {
              fromPersonId,
              toPersonId
            },
            {
              fromPersonId: toPersonId,
              toPersonId: fromPersonId
            }
          ]
        }
      });
    }

    const inverseType = inverseRelationshipType(
      relationshipType as SharedRelationshipType
    ) as RelationshipType;
    return prisma.relationship.deleteMany({
      where: {
        userId,
        familyId: null,
        OR: [
          {
            fromPersonId,
            toPersonId,
            type: relationshipType
          },
          {
            fromPersonId: toPersonId,
            toPersonId: fromPersonId,
            type: inverseType
          }
        ]
      }
    });
  }

  async getPhotoCooccurrence(
    userId: string,
    immichClient: ImmichClient,
    options: BuildPhotoCooccurrenceOptions
  ): Promise<PhotoCooccurrenceResult> {
    const now = Date.now();
    this.evictExpiredPhotoCooccurrenceStats(now);

    const cached = this.photoCooccurrenceStatsCache.get(userId);
    if (cached) {
      this.photoCooccurrenceStatsCache.delete(userId);
      this.photoCooccurrenceStatsCache.set(userId, {
        expiresAt: now + this.photoCooccurrenceCacheTtlMs,
        stats: cached.stats
      });

      return buildPhotoCooccurrenceResult(cached.stats, options);
    }

    const stats = buildPhotoCooccurrenceStats(await immichClient.listAssetsWithPeople());
    this.photoCooccurrenceStatsCache.set(userId, {
      expiresAt: now + this.photoCooccurrenceCacheTtlMs,
      stats
    });
    this.evictOverflowPhotoCooccurrenceStats();

    return buildPhotoCooccurrenceResult(stats, options);
  }
}
