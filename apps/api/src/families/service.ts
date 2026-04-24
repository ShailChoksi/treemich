import type { CreateFamilyBody, PatchFamilyBody } from "@treemich/shared";
import { FamilyChildPedigree, type Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";
import type { RelationshipService } from "../relationships/service.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

type FamilyWithChildren = Prisma.FamilyGetPayload<{ include: { children: true } }>;

const toIso = (d: Date) => d.toISOString();

export const familyToJson = (row: FamilyWithChildren) => ({
  id: row.id,
  userId: row.userId,
  parent1ImmichPersonId: row.parent1ImmichPersonId,
  parent2ImmichPersonId: row.parent2ImmichPersonId,
  notes: row.notes,
  externalIds:
    row.externalIds != null && typeof row.externalIds === "object" && !Array.isArray(row.externalIds)
      ? (row.externalIds as Record<string, unknown>)
      : {},
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
  children: row.children.map((c) => ({
    id: c.id,
    childImmichPersonId: c.childImmichPersonId,
    pedigree: c.pedigree,
    createdAt: toIso(c.createdAt),
    updatedAt: toIso(c.updatedAt)
  }))
});

export class FamilyService {
  constructor(private readonly relationshipService: RelationshipService) {}

  private async ensureProfiles(tx: DbClient, userId: string, immichPersonIds: string[]) {
    for (const immichPersonId of new Set(immichPersonIds)) {
      await this.relationshipService.upsertProfile(userId, immichPersonId, {}, tx);
    }
  }

  /**
   * Rebuilds parent/child rows tagged with `familyId` and ensures a spouse edge when two parents exist.
   * Spouse edges are not tagged with `familyId` (shared across unions for the same couple).
   */
  async syncDerivedEdges(
    tx: Prisma.TransactionClient,
    userId: string,
    familyId: string,
    row: Pick<FamilyWithChildren, "parent1ImmichPersonId" | "parent2ImmichPersonId" | "children">
  ) {
    await tx.relationship.deleteMany({ where: { userId, familyId } });

    const parents = [row.parent1ImmichPersonId, row.parent2ImmichPersonId].filter(
      (v): v is string => typeof v === "string" && v.length > 0
    );

    if (parents.length === 2) {
      const a = parents[0]!;
      const b = parents[1]!;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      await this.relationshipService.upsertRelationship(userId, lo, hi, "SPOUSE_OF", { db: tx });
    }

    for (const child of row.children) {
      for (const parentId of parents) {
        await this.relationshipService.upsertRelationship(
          userId,
          parentId,
          child.childImmichPersonId,
          "PARENT_OF",
          { db: tx, familyId }
        );
      }
    }
  }

  async listFamilies(userId: string): Promise<FamilyWithChildren[]> {
    return prisma.family.findMany({
      where: { userId },
      include: { children: true },
      orderBy: { createdAt: "asc" }
    });
  }

  async getFamily(userId: string, familyId: string): Promise<FamilyWithChildren> {
    const row = await prisma.family.findFirst({
      where: { id: familyId, userId },
      include: { children: true }
    });
    if (!row) {
      throw new HttpNotFoundError("Family not found");
    }
    return row;
  }

  async listFamiliesForPerson(userId: string, immichPersonId: string): Promise<FamilyWithChildren[]> {
    return prisma.family.findMany({
      where: {
        userId,
        OR: [
          { parent1ImmichPersonId: immichPersonId },
          { parent2ImmichPersonId: immichPersonId },
          { children: { some: { childImmichPersonId: immichPersonId } } }
        ]
      },
      include: { children: true },
      orderBy: { createdAt: "asc" }
    });
  }

  /**
   * Children listed as ADOPTED in a family where any of `parentImmichPersonIds` is a parent slot.
   */
  async findAdoptedChildImmichPersonIds(userId: string, parentImmichPersonIds: string[]): Promise<string[]> {
    if (parentImmichPersonIds.length === 0) {
      return [];
    }
    const rows = await prisma.familyChild.findMany({
      where: {
        pedigree: FamilyChildPedigree.ADOPTED,
        family: {
          userId,
          OR: [
            { parent1ImmichPersonId: { in: parentImmichPersonIds } },
            { parent2ImmichPersonId: { in: parentImmichPersonIds } }
          ]
        }
      },
      select: { childImmichPersonId: true }
    });
    return [...new Set(rows.map((r) => r.childImmichPersonId))];
  }

  async createFamily(userId: string, body: CreateFamilyBody): Promise<FamilyWithChildren> {
    const parent1 = body.parent1ImmichPersonId ?? null;
    const parent2 = body.parent2ImmichPersonId ?? null;
    const childRows = body.children ?? [];

    return prisma.$transaction(async (tx) => {
      const involved = [...childRows.map((c) => c.childImmichPersonId)];
      if (parent1) {
        involved.push(parent1);
      }
      if (parent2) {
        involved.push(parent2);
      }
      await this.ensureProfiles(tx, userId, involved);

      const ext =
        body.externalIds != null && typeof body.externalIds === "object" && !Array.isArray(body.externalIds)
          ? (body.externalIds as Prisma.InputJsonValue)
          : undefined;

      const family = await tx.family.create({
        data: {
          userId,
          parent1ImmichPersonId: parent1,
          parent2ImmichPersonId: parent2,
          notes: body.notes ?? null,
          ...(ext !== undefined ? { externalIds: ext } : {}),
          children: {
            create: childRows.map((c) => ({
              childImmichPersonId: c.childImmichPersonId,
              pedigree: (c.pedigree ?? FamilyChildPedigree.UNKNOWN) as FamilyChildPedigree
            }))
          }
        },
        include: { children: true }
      });

      await this.syncDerivedEdges(tx, userId, family.id, family);
      return tx.family.findUniqueOrThrow({
        where: { id: family.id },
        include: { children: true }
      });
    });
  }

  async patchFamily(userId: string, familyId: string, body: PatchFamilyBody): Promise<FamilyWithChildren> {
    await this.getFamily(userId, familyId);

    return prisma.$transaction(async (tx) => {
      const data: Prisma.FamilyUpdateInput = {};
      if (body.parent1ImmichPersonId !== undefined) {
        data.parent1ImmichPersonId = body.parent1ImmichPersonId;
      }
      if (body.parent2ImmichPersonId !== undefined) {
        data.parent2ImmichPersonId = body.parent2ImmichPersonId;
      }
      if (body.notes !== undefined) {
        data.notes = body.notes;
      }

      if (Object.keys(data).length > 0) {
        await tx.family.update({
          where: { id: familyId },
          data
        });
      }

      if (body.children !== undefined) {
        await tx.familyChild.deleteMany({ where: { familyId } });
        if (body.children.length > 0) {
          await tx.familyChild.createMany({
            data: body.children.map((c) => ({
              familyId,
              childImmichPersonId: c.childImmichPersonId,
              pedigree: (c.pedigree ?? FamilyChildPedigree.UNKNOWN) as FamilyChildPedigree
            }))
          });
        }
      }

      const merged = await tx.family.findUniqueOrThrow({
        where: { id: familyId },
        include: { children: true }
      });

      const p1 = merged.parent1ImmichPersonId;
      const p2 = merged.parent2ImmichPersonId;
      if (p1 && p2 && p1 === p2) {
        throw new HttpValidationError("parent1ImmichPersonId and parent2ImmichPersonId must differ");
      }
      for (const c of merged.children) {
        if (p1 && c.childImmichPersonId === p1) {
          throw new HttpValidationError("A child cannot be the same person as parent1");
        }
        if (p2 && c.childImmichPersonId === p2) {
          throw new HttpValidationError("A child cannot be the same person as parent2");
        }
      }
      if (!p1 && !p2 && merged.children.length === 0) {
        throw new HttpValidationError("Family must include at least one parent or one child");
      }

      const involved = [...merged.children.map((c) => c.childImmichPersonId)];
      if (p1) {
        involved.push(p1);
      }
      if (p2) {
        involved.push(p2);
      }
      await this.ensureProfiles(tx, userId, involved);

      await this.syncDerivedEdges(tx, userId, familyId, merged);
      return tx.family.findUniqueOrThrow({
        where: { id: familyId },
        include: { children: true }
      });
    });
  }

  async deleteFamily(userId: string, familyId: string): Promise<void> {
    await this.getFamily(userId, familyId);
    await prisma.family.delete({ where: { id: familyId } });
  }
}
