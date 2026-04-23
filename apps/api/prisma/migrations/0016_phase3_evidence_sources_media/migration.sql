-- Phase 3: repositories, shared sources, normalized citations, media evidence (empty tables until used).

CREATE TYPE "MediaLinkTargetType" AS ENUM ('PERSON_PROFILE', 'LIFE_EVENT', 'SOURCE');

CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publication" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "lifeEventId" TEXT NOT NULL,
    "page" TEXT,
    "notes" TEXT,
    "citedAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaObject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "checksum" TEXT,
    "immichAssetId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaObject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaObjectId" TEXT NOT NULL,
    "targetType" "MediaLinkTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Repository_userId_name_key" ON "Repository"("userId", "name");

CREATE INDEX "Repository_userId_idx" ON "Repository"("userId");

CREATE INDEX "Source_userId_idx" ON "Source"("userId");

CREATE INDEX "Source_userId_repositoryId_idx" ON "Source"("userId", "repositoryId");

CREATE INDEX "Citation_userId_idx" ON "Citation"("userId");

CREATE INDEX "Citation_lifeEventId_idx" ON "Citation"("lifeEventId");

CREATE INDEX "Citation_sourceId_idx" ON "Citation"("sourceId");

CREATE INDEX "MediaObject_userId_idx" ON "MediaObject"("userId");

CREATE INDEX "MediaLink_userId_targetType_targetId_idx" ON "MediaLink"("userId", "targetType", "targetId");

CREATE INDEX "MediaLink_mediaObjectId_idx" ON "MediaLink"("mediaObjectId");

ALTER TABLE "Repository" ADD CONSTRAINT "Repository_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Source" ADD CONSTRAINT "Source_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Source" ADD CONSTRAINT "Source_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Citation" ADD CONSTRAINT "Citation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Citation" ADD CONSTRAINT "Citation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Citation" ADD CONSTRAINT "Citation_lifeEventId_fkey" FOREIGN KEY ("lifeEventId") REFERENCES "LifeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_mediaObjectId_fkey" FOREIGN KEY ("mediaObjectId") REFERENCES "MediaObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate legacy life-event citations into Repository + Source + Citation.
CREATE TEMP TABLE "_tmp_citation_source" AS
SELECT lec."id" AS "oldCitationId", gen_random_uuid()::text AS "newSourceId"
FROM "LifeEventCitation" lec;

INSERT INTO "Repository" ("id", "userId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sub."userId", sub."rname", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT le."userId", TRIM(BOTH FROM lec.repository) AS "rname"
    FROM "LifeEventCitation" lec
    INNER JOIN "LifeEvent" le ON le."id" = lec."lifeEventId"
    WHERE lec.repository IS NOT NULL AND TRIM(BOTH FROM lec.repository) <> ''
) AS sub;

INSERT INTO "Source" ("id", "userId", "repositoryId", "title", "author", "publication", "url", "notes", "createdAt", "updatedAt")
SELECT
    t."newSourceId",
    le."userId",
    (
        SELECT r."id"
        FROM "Repository" r
        WHERE r."userId" = le."userId"
          AND r."name" = TRIM(BOTH FROM lec.repository)
        LIMIT 1
    ),
    COALESCE(NULLIF(TRIM(BOTH FROM lec.title), ''), 'Citation'),
    NULL,
    NULL,
    NULLIF(TRIM(BOTH FROM lec.url), ''),
    NULL,
    lec."createdAt",
    lec."updatedAt"
FROM "LifeEventCitation" lec
INNER JOIN "LifeEvent" le ON le."id" = lec."lifeEventId"
INNER JOIN "_tmp_citation_source" t ON t."oldCitationId" = lec."id";

INSERT INTO "Citation" ("id", "userId", "sourceId", "lifeEventId", "page", "notes", "citedAt", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    le."userId",
    t."newSourceId",
    lec."lifeEventId",
    lec.page,
    lec.notes,
    lec."citedAt",
    lec."createdAt",
    lec."updatedAt"
FROM "LifeEventCitation" lec
INNER JOIN "LifeEvent" le ON le."id" = lec."lifeEventId"
INNER JOIN "_tmp_citation_source" t ON t."oldCitationId" = lec."id";

DROP TABLE "LifeEventCitation";
