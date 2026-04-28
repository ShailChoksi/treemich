-- Phase 7 cleanup: Treemich PersonProfile.id is the only core person key.
-- Immich person ids are preserved in PersonExternalIdentity.

DROP INDEX IF EXISTS "PersonProfile_userId_immichPersonId_key";
ALTER TABLE "PersonProfile" DROP COLUMN IF EXISTS "immichPersonId";
