-- Phase 2: research workflow tasks for person-scoped or global to-dos.
CREATE TYPE "ResearchTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');

CREATE TABLE "ResearchTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "immichPersonId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ResearchTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResearchTask_userId_immichPersonId_idx" ON "ResearchTask"("userId", "immichPersonId");
CREATE INDEX "ResearchTask_userId_status_idx" ON "ResearchTask"("userId", "status");
CREATE INDEX "ResearchTask_userId_createdAt_idx" ON "ResearchTask"("userId", "createdAt");

ALTER TABLE "ResearchTask" ADD CONSTRAINT "ResearchTask_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
