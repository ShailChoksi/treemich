-- Phase 4 completion: Immich account identity belongs only to LinkedImmichAccount.
-- Existing LinkedImmichAccount rows already contain the encrypted provider token needed
-- for imports. TreemichUser never stored a recoverable provider token, so this migration
-- intentionally does not synthesize linked-account rows from legacy metadata alone.

DROP INDEX IF EXISTS "TreemichUser_immichBaseUrl_immichUserId_key";
DROP INDEX IF EXISTS "TreemichUser_immichBaseUrl_immichEmail_key";

ALTER TABLE "TreemichUser" DROP COLUMN IF EXISTS "immichBaseUrl";
ALTER TABLE "TreemichUser" DROP COLUMN IF EXISTS "immichUserId";
ALTER TABLE "TreemichUser" DROP COLUMN IF EXISTS "immichEmail";
ALTER TABLE "TreemichUser" DROP COLUMN IF EXISTS "immichName";
