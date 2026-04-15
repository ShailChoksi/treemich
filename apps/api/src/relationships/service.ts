import { Gender, RelationshipType, type PersonProfile, type Relationship } from "@prisma/client";
import { prisma } from "../db/client.js";
import type { ImmichClient } from "../integrations/immich/client.js";
import {
  buildPhotoCooccurrenceResult,
  buildPhotoCooccurrenceStats,
  type BuildPhotoCooccurrenceOptions,
  type PhotoCooccurrenceResult,
  type PhotoCooccurrenceStats
} from "./cooccurrence.js";

const inverseMapping: Record<RelationshipType, RelationshipType> = {
  CHILD_OF: "PARENT_OF",
  PARENT_OF: "CHILD_OF",
  SIBLING_OF: "SIBLING_OF",
  SPOUSE_OF: "SPOUSE_OF"
};

export class RelationshipService {
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
    immichPersonId: string,
    profile: {
      gender?: Gender;
      birthDateOverride?: string | null;
    }
  ): Promise<PersonProfile> {
    return prisma.personProfile.upsert({
      where: {
        userId_immichPersonId: {
          userId,
          immichPersonId
        }
      },
      update: {
        ...(profile.gender !== undefined ? { gender: profile.gender } : {}),
        ...(profile.birthDateOverride !== undefined ? { birthDateOverride: profile.birthDateOverride } : {})
      },
      create: {
        userId,
        immichPersonId,
        gender: profile.gender ?? Gender.UNKNOWN,
        birthDateOverride: profile.birthDateOverride ?? null
      }
    });
  }

  async upsertRelationship(
    userId: string,
    fromPersonId: string,
    toPersonId: string,
    relationshipType: RelationshipType
  ): Promise<{ direct: Relationship; inverse: Relationship }> {
    const inverseType = inverseMapping[relationshipType];
    return prisma.$transaction(async (tx) => {
      await tx.personProfile.upsert({
        where: {
          userId_immichPersonId: {
            userId,
            immichPersonId: fromPersonId
          }
        },
        update: {},
        create: { userId, immichPersonId: fromPersonId, gender: Gender.UNKNOWN }
      });
      await tx.personProfile.upsert({
        where: {
          userId_immichPersonId: {
            userId,
            immichPersonId: toPersonId
          }
        },
        update: {},
        create: { userId, immichPersonId: toPersonId, gender: Gender.UNKNOWN }
      });

      const direct = await tx.relationship.upsert({
        where: {
          userId_fromPersonId_toPersonId_type: {
            userId,
            fromPersonId,
            toPersonId,
            type: relationshipType
          }
        },
        update: {},
        create: {
          userId,
          fromPersonId,
          toPersonId,
          type: relationshipType
        }
      });

      const inverse = await tx.relationship.upsert({
        where: {
          userId_fromPersonId_toPersonId_type: {
            userId,
            fromPersonId: toPersonId,
            toPersonId: fromPersonId,
            type: inverseType
          }
        },
        update: {},
        create: {
          userId,
          fromPersonId: toPersonId,
          toPersonId: fromPersonId,
          type: inverseType
        }
      });

      return { direct, inverse };
    });
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

  async getProfilesForPersonIds(userId: string, personIds: string[]) {
    const profiles = await prisma.personProfile.findMany({
      where: {
        userId,
        immichPersonId: { in: personIds }
      }
    });

    return new Map(profiles.map((profile) => [profile.immichPersonId, profile]));
  }

  async getConnectedPersonIds(userId: string, personIds: string[]) {
    const relationships = await prisma.relationship.findMany({
      where: {
        userId,
        OR: [{ fromPersonId: { in: personIds } }, { toPersonId: { in: personIds } }]
      },
      select: {
        fromPersonId: true,
        toPersonId: true
      }
    });

    const connectedIds = new Set<string>();
    for (const relationship of relationships) {
      connectedIds.add(relationship.fromPersonId);
      connectedIds.add(relationship.toPersonId);
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
        type: true
      }
    });

    const hasMore = relationships.length > limit;
    const pageItems = hasMore ? relationships.slice(0, limit) : relationships;
    const lastItem = pageItems[pageItems.length - 1];

    return {
      relationships: pageItems.map((item) => ({
        fromPersonId: item.fromPersonId,
        toPersonId: item.toPersonId,
        type: item.type
      })),
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

    const inverseType = inverseMapping[relationshipType];
    return prisma.relationship.deleteMany({
      where: {
        userId,
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
