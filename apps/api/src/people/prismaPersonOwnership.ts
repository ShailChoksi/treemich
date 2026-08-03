import { prisma } from "../db/client.js";
import { PersonNotFoundError, type PersonOwnership, type PersonOwnershipDb } from "./ownership.js";

export class PrismaPersonOwnership implements PersonOwnership {
  constructor(private readonly db: PersonOwnershipDb = prisma) {}

  with(db: PersonOwnershipDb): PersonOwnership {
    return new PrismaPersonOwnership(db);
  }

  async assertOwned(userId: string, personId: string): Promise<string> {
    const row = await this.db.personProfile.findFirst({
      where: { id: personId, userId },
      select: { id: true }
    });
    if (!row) {
      throw new PersonNotFoundError();
    }
    return row.id;
  }
}
