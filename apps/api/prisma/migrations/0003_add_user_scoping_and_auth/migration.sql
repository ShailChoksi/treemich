-- CreateTable
CREATE TABLE "TreemichUser" (
    "id" TEXT NOT NULL,
    "immichBaseUrl" TEXT NOT NULL,
    "immichUserId" TEXT NOT NULL,
    "immichEmail" TEXT NOT NULL,
    "immichName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreemichUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedImmichAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "immichBaseUrl" TEXT NOT NULL,
    "immichUserId" TEXT NOT NULL,
    "immichEmail" TEXT NOT NULL,
    "immichName" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "accessTokenIv" TEXT NOT NULL,
    "accessTokenTag" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedImmichAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreemichSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreemichSession_pkey" PRIMARY KEY ("id")
);

-- Create the legacy owner used to preserve pre-auth shared data.
INSERT INTO "TreemichUser" ("id", "immichBaseUrl", "immichUserId", "immichEmail", "immichName", "createdAt", "updatedAt")
VALUES (
    'legacy-shared-user',
    'legacy://shared',
    'legacy-shared-user',
    'legacy@treemich.local',
    'Legacy Shared Data',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "PersonProfile" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "Relationship" ADD COLUMN "userId" TEXT;

-- Backfill existing shared rows onto the legacy owner before enforcing NOT NULL.
UPDATE "PersonProfile"
SET "userId" = 'legacy-shared-user'
WHERE "userId" IS NULL;

UPDATE "Relationship"
SET "userId" = 'legacy-shared-user'
WHERE "userId" IS NULL;

-- Repair any orphaned legacy relationship endpoints before adding scoped foreign keys.
INSERT INTO "PersonProfile" (
    "id",
    "userId",
    "immichPersonId",
    "gender",
    "birthDateOverride",
    "displayNameOverride",
    "createdAt",
    "updatedAt"
)
SELECT
    md5('legacy-profile:' || missing."immichPersonId"),
    'legacy-shared-user',
    missing."immichPersonId",
    'UNKNOWN'::"Gender",
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "fromPersonId" AS "immichPersonId"
    FROM "Relationship"
    WHERE "userId" = 'legacy-shared-user'

    UNION

    SELECT DISTINCT "toPersonId" AS "immichPersonId"
    FROM "Relationship"
    WHERE "userId" = 'legacy-shared-user'
) AS missing
LEFT JOIN "PersonProfile" profile
    ON profile."userId" = 'legacy-shared-user'
   AND profile."immichPersonId" = missing."immichPersonId"
WHERE profile."id" IS NULL;

-- AlterTable
ALTER TABLE "PersonProfile" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Relationship" ALTER COLUMN "userId" SET NOT NULL;

-- Drop legacy Relationship FKs first: they target PersonProfile(immichPersonId), which keeps the unique index
-- PersonProfile_immichPersonId_key; PostgreSQL will not drop that index until these constraints are removed.
ALTER TABLE "Relationship" DROP CONSTRAINT "Relationship_fromPersonId_fkey";

ALTER TABLE "Relationship" DROP CONSTRAINT "Relationship_toPersonId_fkey";

-- DropIndex
DROP INDEX "PersonProfile_immichPersonId_key";

-- DropIndex
DROP INDEX "Relationship_fromPersonId_toPersonId_type_key";

-- CreateIndex
CREATE UNIQUE INDEX "TreemichUser_immichBaseUrl_immichUserId_key" ON "TreemichUser"("immichBaseUrl", "immichUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TreemichUser_immichBaseUrl_immichEmail_key" ON "TreemichUser"("immichBaseUrl", "immichEmail");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedImmichAccount_userId_key" ON "LinkedImmichAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedImmichAccount_immichBaseUrl_immichUserId_key" ON "LinkedImmichAccount"("immichBaseUrl", "immichUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TreemichSession_tokenHash_key" ON "TreemichSession"("tokenHash");

-- CreateIndex
CREATE INDEX "TreemichSession_userId_idx" ON "TreemichSession"("userId");

-- CreateIndex
CREATE INDEX "TreemichSession_expiresAt_idx" ON "TreemichSession"("expiresAt");

-- CreateIndex
CREATE INDEX "PersonProfile_userId_idx" ON "PersonProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonProfile_userId_immichPersonId_key" ON "PersonProfile"("userId", "immichPersonId");

-- CreateIndex
CREATE INDEX "Relationship_userId_fromPersonId_idx" ON "Relationship"("userId", "fromPersonId");

-- CreateIndex
CREATE INDEX "Relationship_userId_toPersonId_idx" ON "Relationship"("userId", "toPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_userId_fromPersonId_toPersonId_type_key" ON "Relationship"("userId", "fromPersonId", "toPersonId", "type");

-- AddForeignKey
ALTER TABLE "LinkedImmichAccount" ADD CONSTRAINT "LinkedImmichAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreemichSession" ADD CONSTRAINT "TreemichSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonProfile" ADD CONSTRAINT "PersonProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_userId_fromPersonId_fkey" FOREIGN KEY ("userId", "fromPersonId") REFERENCES "PersonProfile"("userId", "immichPersonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_userId_toPersonId_fkey" FOREIGN KEY ("userId", "toPersonId") REFERENCES "PersonProfile"("userId", "immichPersonId") ON DELETE CASCADE ON UPDATE CASCADE;
