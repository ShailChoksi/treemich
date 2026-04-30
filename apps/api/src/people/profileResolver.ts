import type { Prisma } from "@prisma/client";
import { HttpNotFoundError } from "../lifeEvents/errors.js";
import type { prisma } from "../db/client.js";

export type DbClient = Prisma.TransactionClient | typeof prisma;

export interface ProfileResolver {
  resolveProfile(userId: string, personId: string, db?: DbClient): Promise<{ id: string }>;
}

export class CanonicalProfileResolver implements ProfileResolver {
  constructor(private readonly db: typeof prisma) {}

  async resolveProfile(userId: string, personId: string, db: DbClient = this.db) {
    const profile = await db.personProfile.findFirst({
      where: { id: personId, userId },
      select: { id: true }
    });
    if (!profile) {
      throw new HttpNotFoundError("Person not found");
    }
    return profile;
  }
}
