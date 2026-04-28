-- Treemich-owned person identity. PersonProfile.id becomes the canonical person id;
-- Immich person ids move to optional external identities for provider import/linking.

CREATE TYPE "PersonExternalIdentityProvider" AS ENUM ('IMMICH', 'GEDCOM', 'OTHER');
CREATE TYPE "PersonThumbnailSource" AS ENUM ('UPLOADED', 'IMMICH', 'GENERATED');

ALTER TABLE "TreemichUser" ADD COLUMN "email" TEXT;
ALTER TABLE "TreemichUser" ADD COLUMN "name" TEXT;
ALTER TABLE "TreemichUser" ADD COLUMN "passwordHash" TEXT;

UPDATE "TreemichUser"
SET "email" = "immichEmail",
    "name" = "immichName"
WHERE "email" IS NULL;

CREATE TABLE "PersonExternalIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "provider" "PersonExternalIdentityProvider" NOT NULL,
    "providerPersonId" TEXT NOT NULL,
    "providerBaseUrl" TEXT,
    "displayName" TEXT,
    "thumbnailImportedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonThumbnail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "source" "PersonThumbnailSource" NOT NULL,
    "storageUrl" TEXT,
    "mimeType" TEXT,
    "checksum" TEXT,
    "sourceExternalIdentityId" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonThumbnail_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PersonExternalIdentity" (
    "id",
    "userId",
    "personId",
    "provider",
    "providerPersonId",
    "providerBaseUrl",
    "displayName",
    "lastSeenAt",
    "metadata",
    "createdAt",
    "updatedAt"
)
SELECT
    'immich_' || md5(p."userId" || ':' || COALESCE(u."immichBaseUrl", '') || ':' || p."immichPersonId"),
    p."userId",
    p."id",
    'IMMICH'::"PersonExternalIdentityProvider",
    p."immichPersonId",
    u."immichBaseUrl",
    p."displayNameOverride",
    p."updatedAt",
    jsonb_build_object('migratedFromPersonProfile', true),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "PersonProfile" p
JOIN "TreemichUser" u ON u."id" = p."userId"
WHERE p."immichPersonId" IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE "PersonProfile" ALTER COLUMN "immichPersonId" DROP NOT NULL;

ALTER TABLE "Family" ADD COLUMN "parent1PersonId" TEXT;
ALTER TABLE "Family" ADD COLUMN "parent2PersonId" TEXT;
ALTER TABLE "FamilyChild" ADD COLUMN "childPersonId" TEXT;
ALTER TABLE "FamilyChild" ALTER COLUMN "childImmichPersonId" DROP NOT NULL;
ALTER TABLE "ResearchTask" ADD COLUMN "personId" TEXT;

UPDATE "Family" f
SET "parent1PersonId" = p."id"
FROM "PersonProfile" p
WHERE p."userId" = f."userId"
  AND p."immichPersonId" = f."parent1ImmichPersonId";

UPDATE "Family" f
SET "parent2PersonId" = p."id"
FROM "PersonProfile" p
WHERE p."userId" = f."userId"
  AND p."immichPersonId" = f."parent2ImmichPersonId";

UPDATE "FamilyChild" fc
SET "childPersonId" = p."id"
FROM "Family" f
JOIN "PersonProfile" p
  ON p."userId" = f."userId"
 AND p."immichPersonId" = fc."childImmichPersonId"
WHERE f."id" = fc."familyId";

UPDATE "ResearchTask" rt
SET "personId" = p."id"
FROM "PersonProfile" p
WHERE p."userId" = rt."userId"
  AND p."immichPersonId" = rt."immichPersonId";

ALTER TABLE "Relationship" DROP CONSTRAINT IF EXISTS "Relationship_userId_fromPersonId_fkey";
ALTER TABLE "Relationship" DROP CONSTRAINT IF EXISTS "Relationship_userId_toPersonId_fkey";

UPDATE "Relationship" r
SET "fromPersonId" = p."id"
FROM "PersonProfile" p
WHERE p."userId" = r."userId"
  AND p."immichPersonId" = r."fromPersonId";

UPDATE "Relationship" r
SET "toPersonId" = p."id"
FROM "PersonProfile" p
WHERE p."userId" = r."userId"
  AND p."immichPersonId" = r."toPersonId";

CREATE INDEX "PersonProfile_userId_givenName_idx" ON "PersonProfile"("userId", "givenName");
CREATE INDEX "PersonProfile_userId_surname_idx" ON "PersonProfile"("userId", "surname");

CREATE UNIQUE INDEX "PersonExternalIdentity_userId_provider_providerBaseUrl_providerPersonId_key"
  ON "PersonExternalIdentity"("userId", "provider", "providerBaseUrl", "providerPersonId");
CREATE INDEX "PersonExternalIdentity_userId_personId_idx" ON "PersonExternalIdentity"("userId", "personId");
CREATE INDEX "PersonExternalIdentity_provider_providerPersonId_idx" ON "PersonExternalIdentity"("provider", "providerPersonId");

CREATE INDEX "PersonThumbnail_userId_personId_idx" ON "PersonThumbnail"("userId", "personId");
CREATE INDEX "PersonThumbnail_sourceExternalIdentityId_idx" ON "PersonThumbnail"("sourceExternalIdentityId");

CREATE INDEX "Family_userId_parent1PersonId_idx" ON "Family"("userId", "parent1PersonId");
CREATE INDEX "Family_userId_parent2PersonId_idx" ON "Family"("userId", "parent2PersonId");
CREATE INDEX "FamilyChild_childPersonId_idx" ON "FamilyChild"("childPersonId");
CREATE INDEX "ResearchTask_userId_personId_idx" ON "ResearchTask"("userId", "personId");

ALTER TABLE "PersonExternalIdentity" ADD CONSTRAINT "PersonExternalIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonExternalIdentity" ADD CONSTRAINT "PersonExternalIdentity_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonThumbnail" ADD CONSTRAINT "PersonThumbnail_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonThumbnail" ADD CONSTRAINT "PersonThumbnail_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonThumbnail" ADD CONSTRAINT "PersonThumbnail_sourceExternalIdentityId_fkey"
  FOREIGN KEY ("sourceExternalIdentityId") REFERENCES "PersonExternalIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ResearchTask" ADD CONSTRAINT "ResearchTask_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_fromPersonId_fkey"
  FOREIGN KEY ("fromPersonId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_toPersonId_fkey"
  FOREIGN KEY ("toPersonId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
