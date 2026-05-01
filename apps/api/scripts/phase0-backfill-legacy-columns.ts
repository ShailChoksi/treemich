/**
 * One-time backfill: copy legacy PersonProfile / Relationship date columns into life events.
 *
 * Run while legacy columns still exist (before migration `0012_phase0_drop_legacy_date_columns`,
 * or before any Phase 0 migrate if you are upgrading an old DB in place). Safe no-op if columns
 * are already gone.
 *
 * From repo root (DATABASE_URL in .env):
 *   npm run phase0:backfill --workspace @treemich/api
 */

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { HttpNotFoundError } from "../src/lifeEvents/errors.js";
import { LifeEventService } from "../src/lifeEvents/service.js";
import type { ProfileResolver } from "../src/people/profileResolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../../../.env") });

const prisma = new PrismaClient();

const profileResolver: ProfileResolver = {
  resolveProfile: async (userId, personId) => {
    const profile = await prisma.personProfile.findFirst({
      where: { id: personId, userId },
      select: { id: true }
    });
    if (!profile) {
      throw new HttpNotFoundError("Person not found");
    }
    return profile;
  }
};

const lifeEvents = new LifeEventService(profileResolver);

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function main() {
  const hasLegacy = await columnExists("PersonProfile", "birthDateOverride");
  if (!hasLegacy) {
    console.log("Legacy columns already removed — nothing to backfill.");
    return;
  }

  type LegacyProfile = {
    id: string;
    userId: string;
    birthDateOverride: string | null;
    deathDate: string | null;
    birthCity: string | null;
    birthCountry: string | null;
  };

  const profiles = await prisma.$queryRaw<LegacyProfile[]>`
    SELECT id, "userId", "birthDateOverride", "deathDate", "birthCity", "birthCountry"
    FROM "PersonProfile"
    WHERE "birthDateOverride" IS NOT NULL
       OR "deathDate" IS NOT NULL
       OR "birthCity" IS NOT NULL
       OR "birthCountry" IS NOT NULL
  `;

  for (const row of profiles) {
    await lifeEvents.syncPersonProfileFieldsToLifeEvents(row.userId, row.id, {
      birthDate: row.birthDateOverride ?? undefined,
      deathDate: row.deathDate ?? undefined,
      birthCity: row.birthCity ?? undefined,
      birthCountry: row.birthCountry ?? undefined
    });
  }

  type LegacyRel = {
    userId: string;
    fromPersonId: string;
    toPersonId: string;
    marriageAnniversaryDate: string | null;
    divorceDate: string | null;
  };

  const rels = await prisma.$queryRaw<LegacyRel[]>`
    SELECT "userId", "fromPersonId", "toPersonId", "marriageAnniversaryDate", "divorceDate"
    FROM "Relationship"
    WHERE type = 'SPOUSE_OF'
      AND "fromPersonId" < "toPersonId"
      AND ("marriageAnniversaryDate" IS NOT NULL OR "divorceDate" IS NOT NULL)
  `;

  for (const row of rels) {
    await lifeEvents.syncSpouseDatesToLifeEvents(row.userId, row.fromPersonId, row.toPersonId, {
      marriageAnniversaryDate: row.marriageAnniversaryDate ?? undefined,
      divorceDate: row.divorceDate ?? undefined
    });
  }

  console.log(`Backfilled ${profiles.length} profiles and ${rels.length} canonical spouse rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
