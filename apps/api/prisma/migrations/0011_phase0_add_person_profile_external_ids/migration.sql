-- Phase 0 (step 1): add interchange metadata; legacy date columns remain until step 2 for optional backfill.

ALTER TABLE "PersonProfile" ADD COLUMN IF NOT EXISTS "externalIds" JSONB NOT NULL DEFAULT '{}';
