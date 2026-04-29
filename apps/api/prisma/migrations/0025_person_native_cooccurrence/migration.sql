-- Store persisted photo co-occurrence edges in Treemich person-id space.
-- Legacy rows may contain Immich person ids; map them through external identities
-- or the deprecated PersonProfile.immichPersonId compatibility column.

ALTER TABLE "CooccurrenceEdge" ADD COLUMN IF NOT EXISTS "sourceProvider" "PersonExternalIdentityProvider";
ALTER TABLE "CooccurrenceEdge" ADD COLUMN IF NOT EXISTS "sourceImportedAt" TIMESTAMP(3);
ALTER TABLE "CooccurrenceEdge" ADD COLUMN IF NOT EXISTS "sourceMetadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "CooccurrenceEdge" DROP CONSTRAINT IF EXISTS "CooccurrenceEdge_userId_personAId_personBId_key";
DROP INDEX IF EXISTS "CooccurrenceEdge_userId_personAId_personBId_key";

CREATE TEMP TABLE "_cooccurrence_remap" AS
SELECT
  e."id",
  COALESCE(direct_a."id", identity_a."personId", legacy_a."id") AS "mappedPersonAId",
  COALESCE(direct_b."id", identity_b."personId", legacy_b."id") AS "mappedPersonBId"
FROM "CooccurrenceEdge" e
LEFT JOIN "PersonProfile" direct_a
  ON direct_a."userId" = e."userId" AND direct_a."id" = e."personAId"
LEFT JOIN "PersonExternalIdentity" identity_a
  ON identity_a."userId" = e."userId"
 AND identity_a."provider" = 'IMMICH'::"PersonExternalIdentityProvider"
 AND identity_a."providerPersonId" = e."personAId"
LEFT JOIN "PersonProfile" legacy_a
  ON legacy_a."userId" = e."userId" AND legacy_a."immichPersonId" = e."personAId"
LEFT JOIN "PersonProfile" direct_b
  ON direct_b."userId" = e."userId" AND direct_b."id" = e."personBId"
LEFT JOIN "PersonExternalIdentity" identity_b
  ON identity_b."userId" = e."userId"
 AND identity_b."provider" = 'IMMICH'::"PersonExternalIdentityProvider"
 AND identity_b."providerPersonId" = e."personBId"
LEFT JOIN "PersonProfile" legacy_b
  ON legacy_b."userId" = e."userId" AND legacy_b."immichPersonId" = e."personBId";

DELETE FROM "CooccurrenceEdge" e
USING "_cooccurrence_remap" r
WHERE e."id" = r."id"
  AND (
    r."mappedPersonAId" IS NULL
    OR r."mappedPersonBId" IS NULL
    OR r."mappedPersonAId" = r."mappedPersonBId"
  );

UPDATE "CooccurrenceEdge" e
SET
  "personAId" = LEAST(r."mappedPersonAId", r."mappedPersonBId"),
  "personBId" = GREATEST(r."mappedPersonAId", r."mappedPersonBId"),
  "sourceProvider" = COALESCE(e."sourceProvider", 'IMMICH'::"PersonExternalIdentityProvider"),
  "sourceImportedAt" = COALESCE(e."sourceImportedAt", e."computedAt"),
  "sourceMetadata" = COALESCE(e."sourceMetadata", '{}'::jsonb)
FROM "_cooccurrence_remap" r
WHERE e."id" = r."id"
  AND r."mappedPersonAId" IS NOT NULL
  AND r."mappedPersonBId" IS NOT NULL
  AND r."mappedPersonAId" <> r."mappedPersonBId";

WITH aggregate_edges AS (
  SELECT
    "userId",
    "personAId",
    "personBId",
    MAX("sharedPhotos") AS "sharedPhotos",
    MAX("score") AS "score",
    MAX("personAPhotoCount") AS "personAPhotoCount",
    MAX("personBPhotoCount") AS "personBPhotoCount",
    MAX("computedAt") AS "computedAt"
  FROM "CooccurrenceEdge"
  GROUP BY "userId", "personAId", "personBId"
),
ranked_edges AS (
  SELECT
    e."id",
    ROW_NUMBER() OVER (
      PARTITION BY e."userId", e."personAId", e."personBId"
      ORDER BY e."sharedPhotos" DESC, e."score" DESC, e."computedAt" DESC, e."id" ASC
    ) AS "rank"
  FROM "CooccurrenceEdge" e
)
UPDATE "CooccurrenceEdge" e
SET
  "sharedPhotos" = a."sharedPhotos",
  "score" = a."score",
  "personAPhotoCount" = a."personAPhotoCount",
  "personBPhotoCount" = a."personBPhotoCount",
  "computedAt" = a."computedAt"
FROM aggregate_edges a, ranked_edges r
WHERE e."id" = r."id"
  AND r."rank" = 1
  AND e."userId" = a."userId"
  AND e."personAId" = a."personAId"
  AND e."personBId" = a."personBId";

WITH ranked_edges AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "personAId", "personBId"
      ORDER BY "sharedPhotos" DESC, "score" DESC, "computedAt" DESC, "id" ASC
    ) AS "rank"
  FROM "CooccurrenceEdge"
)
DELETE FROM "CooccurrenceEdge" e
USING ranked_edges r
WHERE e."id" = r."id" AND r."rank" > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "CooccurrenceEdge_userId_personAId_personBId_key"
  ON "CooccurrenceEdge"("userId", "personAId", "personBId");

ALTER TABLE "CooccurrenceEdge"
  ADD CONSTRAINT "CooccurrenceEdge_personAId_fkey"
  FOREIGN KEY ("personAId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooccurrenceEdge"
  ADD CONSTRAINT "CooccurrenceEdge_personBId_fkey"
  FOREIGN KEY ("personBId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CooccurrenceEdge_userId_sourceProvider_idx" ON "CooccurrenceEdge"("userId", "sourceProvider");
