-- Allow family-scoped LifeEvent rows introduced in 0017_life_event_family_scope.
-- The older person/relationship XOR check from 0010 rejected rows where only familyId is set.

ALTER TABLE "LifeEvent" DROP CONSTRAINT IF EXISTS "LifeEvent_person_xor_relationship";

ALTER TABLE "LifeEvent" DROP CONSTRAINT IF EXISTS "LifeEvent_single_subject_ck";
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_single_subject_ck" CHECK (
  (CASE WHEN "personProfileId" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "relationshipId" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "familyId" IS NOT NULL THEN 1 ELSE 0 END) = 1
);
