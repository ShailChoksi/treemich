-- Phase 4: family-scoped life events (e.g. household census, residence) on LifeEvent.familyId.

ALTER TABLE "LifeEvent" ADD COLUMN "familyId" TEXT;

CREATE INDEX "LifeEvent_userId_familyId_idx" ON "LifeEvent"("userId", "familyId");

ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one of person / relationship / family attachment per row.
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_single_subject_ck" CHECK (
  (CASE WHEN "personProfileId" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "relationshipId" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "familyId" IS NOT NULL THEN 1 ELSE 0 END) <= 1
);
