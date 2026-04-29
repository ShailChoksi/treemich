-- Optional interchange metadata on Family (e.g. GEDCOM FAM xref for idempotent import/export).
ALTER TABLE "Family" ADD COLUMN "externalIds" JSONB NOT NULL DEFAULT '{}';
