-- Phase 0 (step 2): drop legacy profile/spouse date columns (life events are canonical). IF EXISTS supports dev DBs that already dropped manually.

ALTER TABLE "PersonProfile" DROP COLUMN IF EXISTS "birthDateOverride";
ALTER TABLE "PersonProfile" DROP COLUMN IF EXISTS "deathDate";
ALTER TABLE "PersonProfile" DROP COLUMN IF EXISTS "birthCity";
ALTER TABLE "PersonProfile" DROP COLUMN IF EXISTS "birthCountry";

ALTER TABLE "Relationship" DROP COLUMN IF EXISTS "marriageAnniversaryDate";
ALTER TABLE "Relationship" DROP COLUMN IF EXISTS "divorceDate";
