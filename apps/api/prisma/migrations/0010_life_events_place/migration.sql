-- CreateEnum
CREATE TYPE "DateQualifier" AS ENUM ('EXACT', 'ABOUT', 'BEFORE', 'AFTER', 'BETWEEN', 'CALCULATED', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "LifeEventType" AS ENUM (
  'BIRTH',
  'DEATH',
  'MARRIAGE',
  'DIVORCE',
  'BURIAL',
  'CHRISTENING',
  'RESIDENCE',
  'IMMIGRATION',
  'CUSTOM'
);

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "locality" TEXT,
    "adminArea" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifeEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "LifeEventType" NOT NULL,
    "dateQualifier" "DateQualifier" NOT NULL DEFAULT 'EXACT',
    "year" INTEGER,
    "month" INTEGER,
    "day" INTEGER,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "endDay" INTEGER,
    "personProfileId" TEXT,
    "relationshipId" TEXT,
    "placeId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifeEventCitation" (
    "id" TEXT NOT NULL,
    "lifeEventId" TEXT NOT NULL,
    "title" TEXT,
    "repository" TEXT,
    "url" TEXT,
    "page" TEXT,
    "notes" TEXT,
    "citedAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifeEventCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Place_userId_idx" ON "Place"("userId");

-- CreateIndex
CREATE INDEX "Place_userId_name_idx" ON "Place"("userId", "name");

-- CreateIndex
CREATE INDEX "LifeEvent_userId_personProfileId_idx" ON "LifeEvent"("userId", "personProfileId");

-- CreateIndex
CREATE INDEX "LifeEvent_userId_relationshipId_idx" ON "LifeEvent"("userId", "relationshipId");

-- CreateIndex
CREATE INDEX "LifeEvent_placeId_idx" ON "LifeEvent"("placeId");

-- CreateIndex
CREATE INDEX "LifeEventCitation_lifeEventId_idx" ON "LifeEventCitation"("lifeEventId");

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_personProfileId_fkey" FOREIGN KEY ("personProfileId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeEventCitation" ADD CONSTRAINT "LifeEventCitation_lifeEventId_fkey" FOREIGN KEY ("lifeEventId") REFERENCES "LifeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- XOR subject
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_person_xor_relationship" CHECK (
  ("personProfileId" IS NOT NULL AND "relationshipId" IS NULL)
  OR ("personProfileId" IS NULL AND "relationshipId" IS NOT NULL)
);

-- Partial unique: at most one BIRTH / DEATH per person per user
CREATE UNIQUE INDEX "LifeEvent_userId_personProfileId_birth_key"
  ON "LifeEvent" ("userId", "personProfileId")
  WHERE "eventType" = 'BIRTH' AND "personProfileId" IS NOT NULL;

CREATE UNIQUE INDEX "LifeEvent_userId_personProfileId_death_key"
  ON "LifeEvent" ("userId", "personProfileId")
  WHERE "eventType" = 'DEATH' AND "personProfileId" IS NOT NULL;

-- Backfill: Place rows for birth city/country (one per profile row that has either)
INSERT INTO "Place" ("id", "userId", "name", "locality", "countryCode", "createdAt", "updatedAt")
SELECT
  'plc_' || replace(gen_random_uuid()::text, '-', ''),
  p."userId",
  trim(both ' ' FROM concat_ws(', ', NULLIF(trim(p."birthCity"), ''), NULLIF(trim(p."birthCountry"), ''))),
  NULLIF(trim(p."birthCity"), ''),
  CASE
    WHEN upper(trim(COALESCE(p."birthCountry", ''))) ~ '^[A-Z]{2}$' THEN upper(trim(p."birthCountry"))
    ELSE NULL
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PersonProfile" p
WHERE NULLIF(trim(p."birthCity"), '') IS NOT NULL
   OR NULLIF(trim(p."birthCountry"), '') IS NOT NULL;

-- Backfill: BIRTH life events (date and/or place via lateral join to first matching Place)
INSERT INTO "LifeEvent" (
  "id", "userId", "eventType", "dateQualifier", "year", "month", "day",
  "personProfileId", "placeId", "createdAt", "updatedAt"
)
SELECT
  'lev_' || replace(gen_random_uuid()::text, '-', ''),
  p."userId",
  'BIRTH'::"LifeEventType",
  'EXACT'::"DateQualifier",
  CASE
    WHEN p."birthDateOverride" IS NOT NULL
      AND trim(p."birthDateOverride") <> ''
      AND trim(p."birthDateOverride") ~ '^\d{4}-\d{2}-\d{2}$'
      AND to_char(to_date(trim(p."birthDateOverride"), 'YYYY-MM-DD'), 'YYYY-MM-DD') = trim(p."birthDateOverride")
    THEN CAST(split_part(p."birthDateOverride", '-', 1) AS INTEGER)
    ELSE NULL
  END,
  CASE
    WHEN p."birthDateOverride" IS NOT NULL
      AND trim(p."birthDateOverride") <> ''
      AND trim(p."birthDateOverride") ~ '^\d{4}-\d{2}-\d{2}$'
      AND to_char(to_date(trim(p."birthDateOverride"), 'YYYY-MM-DD'), 'YYYY-MM-DD') = trim(p."birthDateOverride")
    THEN CAST(split_part(p."birthDateOverride", '-', 2) AS INTEGER)
    ELSE NULL
  END,
  CASE
    WHEN p."birthDateOverride" IS NOT NULL
      AND trim(p."birthDateOverride") <> ''
      AND trim(p."birthDateOverride") ~ '^\d{4}-\d{2}-\d{2}$'
      AND to_char(to_date(trim(p."birthDateOverride"), 'YYYY-MM-DD'), 'YYYY-MM-DD') = trim(p."birthDateOverride")
    THEN CAST(split_part(p."birthDateOverride", '-', 3) AS INTEGER)
    ELSE NULL
  END,
  p."id",
  pl."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PersonProfile" p
LEFT JOIN LATERAL (
  SELECT pl."id"
  FROM "Place" pl
  WHERE pl."userId" = p."userId"
    AND pl."locality" IS NOT DISTINCT FROM NULLIF(trim(p."birthCity"), '')
    AND pl."countryCode" IS NOT DISTINCT FROM (
      CASE
        WHEN upper(trim(COALESCE(p."birthCountry", ''))) ~ '^[A-Z]{2}$' THEN upper(trim(p."birthCountry"))
        ELSE NULL
      END
    )
  ORDER BY pl."createdAt" ASC
  LIMIT 1
) pl ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM "LifeEvent" e
  WHERE e."personProfileId" = p."id" AND e."eventType" = 'BIRTH'::"LifeEventType"
)
AND (
  (
    p."birthDateOverride" IS NOT NULL
    AND trim(p."birthDateOverride") <> ''
    AND trim(p."birthDateOverride") ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date(trim(p."birthDateOverride"), 'YYYY-MM-DD'), 'YYYY-MM-DD') = trim(p."birthDateOverride")
  )
  OR pl."id" IS NOT NULL
);

-- Backfill DEATH
INSERT INTO "LifeEvent" (
  "id", "userId", "eventType", "dateQualifier", "year", "month", "day",
  "personProfileId", "createdAt", "updatedAt"
)
SELECT
  'lev_' || replace(gen_random_uuid()::text, '-', ''),
  p."userId",
  'DEATH'::"LifeEventType",
  'EXACT'::"DateQualifier",
  CAST(split_part(p."deathDate", '-', 1) AS INTEGER),
  CAST(split_part(p."deathDate", '-', 2) AS INTEGER),
  CAST(split_part(p."deathDate", '-', 3) AS INTEGER),
  p."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PersonProfile" p
WHERE p."deathDate" IS NOT NULL
  AND trim(p."deathDate") <> ''
  AND trim(p."deathDate") ~ '^\d{4}-\d{2}-\d{2}$'
  AND to_char(to_date(trim(p."deathDate"), 'YYYY-MM-DD'), 'YYYY-MM-DD') = trim(p."deathDate")
  AND NOT EXISTS (
    SELECT 1 FROM "LifeEvent" e
    WHERE e."personProfileId" = p."id" AND e."eventType" = 'DEATH'::"LifeEventType"
  );

-- Spouse dates: one MARRIAGE / DIVORCE per canonical SPOUSE_OF edge (lexicographic pair)
INSERT INTO "LifeEvent" (
  "id", "userId", "eventType", "dateQualifier", "year", "month", "day",
  "relationshipId", "createdAt", "updatedAt"
)
SELECT
  'lev_' || replace(gen_random_uuid()::text, '-', ''),
  r."userId",
  'MARRIAGE'::"LifeEventType",
  'EXACT'::"DateQualifier",
  CAST(split_part(r."marriageAnniversaryDate", '-', 1) AS INTEGER),
  CAST(split_part(r."marriageAnniversaryDate", '-', 2) AS INTEGER),
  CAST(split_part(r."marriageAnniversaryDate", '-', 3) AS INTEGER),
  r."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Relationship" r
WHERE r."type" = 'SPOUSE_OF'
  AND r."fromPersonId" < r."toPersonId"
  AND r."marriageAnniversaryDate" IS NOT NULL
  AND trim(r."marriageAnniversaryDate") <> ''
  AND trim(r."marriageAnniversaryDate") ~ '^\d{4}-\d{2}-\d{2}$'
  AND to_char(to_date(trim(r."marriageAnniversaryDate"), 'YYYY-MM-DD'), 'YYYY-MM-DD') = trim(r."marriageAnniversaryDate")
  AND NOT EXISTS (
    SELECT 1 FROM "LifeEvent" e
    WHERE e."relationshipId" = r."id" AND e."eventType" = 'MARRIAGE'::"LifeEventType"
  );

INSERT INTO "LifeEvent" (
  "id", "userId", "eventType", "dateQualifier", "year", "month", "day",
  "relationshipId", "createdAt", "updatedAt"
)
SELECT
  'lev_' || replace(gen_random_uuid()::text, '-', ''),
  r."userId",
  'DIVORCE'::"LifeEventType",
  'EXACT'::"DateQualifier",
  CAST(split_part(r."divorceDate", '-', 1) AS INTEGER),
  CAST(split_part(r."divorceDate", '-', 2) AS INTEGER),
  CAST(split_part(r."divorceDate", '-', 3) AS INTEGER),
  r."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Relationship" r
WHERE r."type" = 'SPOUSE_OF'
  AND r."fromPersonId" < r."toPersonId"
  AND r."divorceDate" IS NOT NULL
  AND trim(r."divorceDate") <> ''
  AND trim(r."divorceDate") ~ '^\d{4}-\d{2}-\d{2}$'
  AND to_char(to_date(trim(r."divorceDate"), 'YYYY-MM-DD'), 'YYYY-MM-DD') = trim(r."divorceDate")
  AND NOT EXISTS (
    SELECT 1 FROM "LifeEvent" e
    WHERE e."relationshipId" = r."id" AND e."eventType" = 'DIVORCE'::"LifeEventType"
  );
