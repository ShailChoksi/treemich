import type { Prisma } from "@prisma/client";
import type { prisma } from "../db/client.js";

export type DbClient = Prisma.TransactionClient | typeof prisma;

export interface ProfileResolver {
  resolveProfile(userId: string, personId: string, db?: DbClient): Promise<string>;
}
