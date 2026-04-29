-- Phase D: persisted duplicate review queue and merge audit trail.

CREATE TYPE "PersonDuplicateCandidateStatus" AS ENUM ('PENDING', 'DISMISSED', 'MERGED');

CREATE TABLE "PersonDuplicateCandidate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "personAId" TEXT NOT NULL,
  "personBId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "reasons" JSONB NOT NULL DEFAULT '[]',
  "status" "PersonDuplicateCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "dismissedAt" TIMESTAMP(3),
  "mergedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PersonDuplicateCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonMergeAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "candidateId" TEXT,
  "canonicalPersonId" TEXT NOT NULL,
  "duplicatePersonId" TEXT NOT NULL,
  "changedCounts" JSONB NOT NULL DEFAULT '{}',
  "warnings" JSONB NOT NULL DEFAULT '[]',
  "externalIdentityPolicy" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PersonMergeAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonDuplicateCandidate_userId_personAId_personBId_key"
  ON "PersonDuplicateCandidate"("userId", "personAId", "personBId");
CREATE INDEX "PersonDuplicateCandidate_userId_status_score_idx"
  ON "PersonDuplicateCandidate"("userId", "status", "score");
CREATE INDEX "PersonDuplicateCandidate_personAId_idx" ON "PersonDuplicateCandidate"("personAId");
CREATE INDEX "PersonDuplicateCandidate_personBId_idx" ON "PersonDuplicateCandidate"("personBId");

CREATE INDEX "PersonMergeAudit_userId_createdAt_idx" ON "PersonMergeAudit"("userId", "createdAt");
CREATE INDEX "PersonMergeAudit_candidateId_idx" ON "PersonMergeAudit"("candidateId");
CREATE INDEX "PersonMergeAudit_canonicalPersonId_idx" ON "PersonMergeAudit"("canonicalPersonId");

ALTER TABLE "PersonDuplicateCandidate"
  ADD CONSTRAINT "PersonDuplicateCandidate_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonDuplicateCandidate"
  ADD CONSTRAINT "PersonDuplicateCandidate_personAId_fkey"
  FOREIGN KEY ("personAId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonDuplicateCandidate"
  ADD CONSTRAINT "PersonDuplicateCandidate_personBId_fkey"
  FOREIGN KEY ("personBId") REFERENCES "PersonProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonMergeAudit"
  ADD CONSTRAINT "PersonMergeAudit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonMergeAudit"
  ADD CONSTRAINT "PersonMergeAudit_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "PersonDuplicateCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PersonMergeAudit"
  ADD CONSTRAINT "PersonMergeAudit_canonicalPersonId_fkey"
  FOREIGN KEY ("canonicalPersonId") REFERENCES "PersonProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
