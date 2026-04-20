-- AlterTable
ALTER TABLE "PersonProfile"
ADD COLUMN "givenName" TEXT,
ADD COLUMN "surname" TEXT,
ADD COLUMN "nicknames" TEXT,
ADD COLUMN "deathDate" TEXT,
ADD COLUMN "birthCity" TEXT,
ADD COLUMN "birthCountry" TEXT;

-- AlterTable
ALTER TABLE "Relationship"
ADD COLUMN "marriageAnniversaryDate" TEXT,
ADD COLUMN "divorceDate" TEXT;
