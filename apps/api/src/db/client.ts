/**
 * @packageDocumentation
 * Shared Prisma client singleton for the Treemich API process.
 */

import { PrismaClient } from "@prisma/client";

/** Global database client — import from `../db/client.js` in routes and services. */
export const prisma = new PrismaClient();
