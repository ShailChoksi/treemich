/**
 * @packageDocumentation
 * Seeding and re-hashing of the built-in admin account at API boot.
 */

import { hashPassword, verifyPassword } from "./crypto.js";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";

/**
 * Ensures an admin user exists in the database.
 *
 * **First boot** — creates `admin@treemich.local` with the password from
 * `TREEMICH_ADMIN_PASSWORD`.
 *
 * **Subsequent boots** — if `TREEMICH_ADMIN_PASSWORD` differs from the stored
 * hash, the stored hash is updated so the env var always stays in sync.
 */
export const ensureAdminAccount = async () => {
  const existingAdmin = await prisma.treemichUser.findFirst({ where: { isAdmin: true } });
  if (existingAdmin) {
    if (
      !existingAdmin.passwordHash ||
      !verifyPassword(env.TREEMICH_ADMIN_PASSWORD, existingAdmin.passwordHash)
    ) {
      await prisma.treemichUser.update({
        where: { id: existingAdmin.id },
        data: { passwordHash: hashPassword(env.TREEMICH_ADMIN_PASSWORD) }
      });
    }
    return;
  }
  await prisma.treemichUser.create({
    data: {
      email: "admin@treemich.local",
      name: "Admin",
      passwordHash: hashPassword(env.TREEMICH_ADMIN_PASSWORD),
      isAdmin: true,
      passwordChangeRequired: true
    }
  });
};
