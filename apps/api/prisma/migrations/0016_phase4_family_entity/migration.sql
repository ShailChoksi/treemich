-- Phase 4: Family (FAM-style) as source of truth for union + children; optional familyId on derived parent/child Relationship rows.

CREATE TYPE "FamilyChildPedigree" AS ENUM ('BIOLOGICAL', 'ADOPTED', 'FOSTER', 'STEP', 'UNKNOWN');

CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parent1ImmichPersonId" TEXT,
    "parent2ImmichPersonId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FamilyChild" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childImmichPersonId" TEXT NOT NULL,
    "pedigree" "FamilyChildPedigree" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyChild_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FamilyChild_familyId_childImmichPersonId_key" ON "FamilyChild"("familyId", "childImmichPersonId");
CREATE INDEX "FamilyChild_childImmichPersonId_idx" ON "FamilyChild"("childImmichPersonId");

CREATE INDEX "Family_userId_idx" ON "Family"("userId");
CREATE INDEX "Family_userId_parent1ImmichPersonId_idx" ON "Family"("userId", "parent1ImmichPersonId");
CREATE INDEX "Family_userId_parent2ImmichPersonId_idx" ON "Family"("userId", "parent2ImmichPersonId");

ALTER TABLE "Family" ADD CONSTRAINT "Family_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FamilyChild" ADD CONSTRAINT "FamilyChild_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Relationship" ADD COLUMN "familyId" TEXT;

CREATE INDEX "Relationship_familyId_idx" ON "Relationship"("familyId");

ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
