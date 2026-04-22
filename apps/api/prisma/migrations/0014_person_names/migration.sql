-- CreateEnum
CREATE TYPE "PersonNameType" AS ENUM ('BIRTH', 'MARRIED', 'AKA', 'MAIDEN', 'RELIGIOUS', 'OTHER');

-- CreateTable
CREATE TABLE "PersonName" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personProfileId" TEXT NOT NULL,
    "type" "PersonNameType" NOT NULL,
    "givenName" TEXT,
    "surname" TEXT,
    "prefix" TEXT,
    "suffix" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonName_userId_personProfileId_idx" ON "PersonName"("userId", "personProfileId");
CREATE INDEX "PersonName_personProfileId_idx" ON "PersonName"("personProfileId");

-- AddForeignKey
ALTER TABLE "PersonName" ADD CONSTRAINT "PersonName_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonName" ADD CONSTRAINT "PersonName_personProfileId_fkey" FOREIGN KEY ("personProfileId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one BIRTH primary per existing profile from given/surname (id is app-style cuid-ish)
INSERT INTO "PersonName" ("id", "userId", "personProfileId", "type", "givenName", "surname", "isPrimary", "notes", "createdAt", "updatedAt")
SELECT
  'pn_' || md5(random()::text || clock_timestamp()::text || pp."id"),
  pp."userId",
  pp."id",
  'BIRTH'::"PersonNameType",
  pp."givenName",
  pp."surname",
  true,
  NULL,
  NOW(),
  NOW()
FROM "PersonProfile" pp;
