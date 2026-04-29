-- Phase 4: Make Immich fields on TreemichUser optional so standalone (non-Immich) accounts work.
-- The unique constraints on (immichBaseUrl, immichUserId) and (immichBaseUrl, immichEmail) are
-- preserved; PostgreSQL treats NULLs as distinct in unique indexes, so multiple standalone
-- users with (NULL, NULL) are allowed while existing Immich-linked users remain unique.

ALTER TABLE "TreemichUser" ALTER COLUMN "immichBaseUrl" DROP NOT NULL;
ALTER TABLE "TreemichUser" ALTER COLUMN "immichUserId"  DROP NOT NULL;
ALTER TABLE "TreemichUser" ALTER COLUMN "immichEmail"   DROP NOT NULL;
ALTER TABLE "TreemichUser" ALTER COLUMN "immichName"    DROP NOT NULL;

-- Backfill: existing users created by loginWithPassword have fake sentinel immich values
-- (immichBaseUrl = 'optional://local').  Clear those back to NULL now that the columns are
-- nullable, so standalone users have clean records.
UPDATE "TreemichUser"
SET
  "immichBaseUrl" = NULL,
  "immichUserId"  = NULL,
  "immichEmail"   = NULL,
  "immichName"    = NULL
WHERE "immichBaseUrl" = 'optional://local';
