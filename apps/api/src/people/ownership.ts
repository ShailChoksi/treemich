import type { Prisma } from "@prisma/client";
import type { prisma } from "../db/client.js";

/** Prisma client or interactive transaction client used by PersonOwnership adapters. */
export type PersonOwnershipDb = Prisma.TransactionClient | typeof prisma;

/**
 * Person-identity Seam: ownership only.
 * Assert a claimed canonical personId belongs to userId, or reject.
 */
export interface PersonOwnership {
  assertOwned(userId: string, personId: string): Promise<string>;
  /** Bind to a unit of work (e.g. transaction). Prisma stays inside the adapter. */
  with(db: PersonOwnershipDb): PersonOwnership;
}

export class PersonNotFoundError extends Error {
  constructor(message = "Person not found") {
    super(message);
    this.name = "PersonNotFoundError";
  }
}
