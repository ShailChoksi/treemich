-- Phase C: family media links and persisted validation findings.

ALTER TYPE "MediaLinkTargetType" ADD VALUE IF NOT EXISTS 'FAMILY';

-- Normalize duplicate links before enforcing one link per user/media/target.
WITH ranked AS (
    SELECT
        "id",
        "userId",
        "mediaObjectId",
        "targetType",
        "targetId",
        "notes",
        ROW_NUMBER() OVER (
            PARTITION BY "userId", "mediaObjectId", "targetType", "targetId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS rn
    FROM "MediaLink"
),
kept AS (
    SELECT *
    FROM ranked
    WHERE rn = 1
),
duplicate_notes AS (
    SELECT
        k."id" AS "keptId",
        STRING_AGG(DISTINCT NULLIF(BTRIM(d."notes"), ''), E'\n--- duplicate media link note ---\n') AS "notesToAppend"
    FROM kept k
    INNER JOIN ranked d
        ON d."userId" = k."userId"
       AND d."mediaObjectId" = k."mediaObjectId"
       AND d."targetType" = k."targetType"
       AND d."targetId" = k."targetId"
       AND d.rn > 1
    WHERE NULLIF(BTRIM(d."notes"), '') IS NOT NULL
    GROUP BY k."id"
)
UPDATE "MediaLink" ml
SET "notes" = CASE
    WHEN NULLIF(BTRIM(ml."notes"), '') IS NULL THEN dn."notesToAppend"
    ELSE ml."notes" || E'\n--- duplicate media link note ---\n' || dn."notesToAppend"
END
FROM duplicate_notes dn
WHERE ml."id" = dn."keptId";

WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "userId", "mediaObjectId", "targetType", "targetId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS rn
    FROM "MediaLink"
)
DELETE FROM "MediaLink" ml
USING ranked r
WHERE ml."id" = r."id"
  AND r.rn > 1;

CREATE UNIQUE INDEX "MediaLink_userId_mediaObjectId_targetType_targetId_key"
    ON "MediaLink"("userId", "mediaObjectId", "targetType", "targetId");

CREATE TYPE "ValidationFindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');
CREATE TYPE "ValidationFindingSeverity" AS ENUM ('ERROR', 'WARNING');

CREATE TABLE "ValidationFinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "ValidationFindingSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "personId" TEXT,
    "relationshipId" TEXT,
    "relatedPersonId" TEXT,
    "familyId" TEXT,
    "status" "ValidationFindingStatus" NOT NULL DEFAULT 'OPEN',
    "fingerprint" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "inProgressAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ValidationFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ValidationFinding_userId_fingerprint_key" ON "ValidationFinding"("userId", "fingerprint");
CREATE INDEX "ValidationFinding_userId_status_idx" ON "ValidationFinding"("userId", "status");
CREATE INDEX "ValidationFinding_userId_code_idx" ON "ValidationFinding"("userId", "code");
CREATE INDEX "ValidationFinding_userId_severity_idx" ON "ValidationFinding"("userId", "severity");
CREATE INDEX "ValidationFinding_userId_personId_idx" ON "ValidationFinding"("userId", "personId");
CREATE INDEX "ValidationFinding_userId_relationshipId_idx" ON "ValidationFinding"("userId", "relationshipId");
CREATE INDEX "ValidationFinding_userId_familyId_idx" ON "ValidationFinding"("userId", "familyId");

ALTER TABLE "ValidationFinding" ADD CONSTRAINT "ValidationFinding_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ValidationFinding" ADD CONSTRAINT "ValidationFinding_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "PersonProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ValidationFinding" ADD CONSTRAINT "ValidationFinding_relationshipId_fkey"
    FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ValidationFinding" ADD CONSTRAINT "ValidationFinding_relatedPersonId_fkey"
    FOREIGN KEY ("relatedPersonId") REFERENCES "PersonProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ValidationFinding" ADD CONSTRAINT "ValidationFinding_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;
