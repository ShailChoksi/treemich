-- Phase 3: Remove legacy Immich-id columns from Family, FamilyChild, and ResearchTask now
-- that the 0022 migration has already backfilled all data into the canonical PersonProfile.id columns.

-- ── Family ────────────────────────────────────────────────────────────────────
-- Drop legacy Immich indexes before removing the columns.
DROP INDEX IF EXISTS "Family_userId_parent1ImmichPersonId_idx";
DROP INDEX IF EXISTS "Family_userId_parent2ImmichPersonId_idx";

-- Add FK constraints on the canonical parent1PersonId / parent2PersonId columns.
ALTER TABLE "Family"
  ADD CONSTRAINT "Family_parent1PersonId_fkey"
  FOREIGN KEY ("parent1PersonId") REFERENCES "PersonProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Family"
  ADD CONSTRAINT "Family_parent2PersonId_fkey"
  FOREIGN KEY ("parent2PersonId") REFERENCES "PersonProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the legacy columns.
ALTER TABLE "Family" DROP COLUMN IF EXISTS "parent1ImmichPersonId";
ALTER TABLE "Family" DROP COLUMN IF EXISTS "parent2ImmichPersonId";

-- ── FamilyChild ───────────────────────────────────────────────────────────────
-- Drop the old unique constraint that was on childImmichPersonId.
DROP INDEX IF EXISTS "FamilyChild_childImmichPersonId_idx";

-- There might be a named unique constraint; drop it if present.
ALTER TABLE "FamilyChild" DROP CONSTRAINT IF EXISTS "FamilyChild_familyId_childImmichPersonId_key";

-- Add FK constraint on childPersonId.
ALTER TABLE "FamilyChild"
  ADD CONSTRAINT "FamilyChild_childPersonId_fkey"
  FOREIGN KEY ("childPersonId") REFERENCES "PersonProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add the new unique constraint on (familyId, childPersonId).
-- NULL values are allowed in both columns; PostgreSQL treats NULLs as distinct in unique indexes.
CREATE UNIQUE INDEX "FamilyChild_familyId_childPersonId_key"
  ON "FamilyChild"("familyId", "childPersonId");

-- Drop the legacy column.
ALTER TABLE "FamilyChild" DROP COLUMN IF EXISTS "childImmichPersonId";

-- ── ResearchTask ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "ResearchTask_userId_immichPersonId_idx";

-- Drop the legacy column.
ALTER TABLE "ResearchTask" DROP COLUMN IF EXISTS "immichPersonId";
