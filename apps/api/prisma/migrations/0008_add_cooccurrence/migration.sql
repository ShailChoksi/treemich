-- CreateEnum
CREATE TYPE "CooccurrenceJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "CooccurrenceSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalDays" INTEGER NOT NULL DEFAULT 7,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooccurrenceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CooccurrenceJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CooccurrenceJobStatus" NOT NULL DEFAULT 'PENDING',
    "sourcePhotoCount" INTEGER,
    "edgeCount" INTEGER,
    "progress" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooccurrenceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CooccurrenceEdge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "sharedPhotos" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "personAPhotoCount" INTEGER NOT NULL,
    "personBPhotoCount" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooccurrenceEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CooccurrenceSchedule_userId_key" ON "CooccurrenceSchedule"("userId");

-- CreateIndex
CREATE INDEX "CooccurrenceSchedule_enabled_nextRunAt_idx" ON "CooccurrenceSchedule"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "CooccurrenceJob_userId_status_idx" ON "CooccurrenceJob"("userId", "status");

-- CreateIndex
CREATE INDEX "CooccurrenceJob_userId_createdAt_idx" ON "CooccurrenceJob"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CooccurrenceEdge_userId_personAId_personBId_key" ON "CooccurrenceEdge"("userId", "personAId", "personBId");

-- CreateIndex
CREATE INDEX "CooccurrenceEdge_userId_idx" ON "CooccurrenceEdge"("userId");

-- CreateIndex
CREATE INDEX "CooccurrenceEdge_userId_personAId_idx" ON "CooccurrenceEdge"("userId", "personAId");

-- CreateIndex
CREATE INDEX "CooccurrenceEdge_userId_personBId_idx" ON "CooccurrenceEdge"("userId", "personBId");

-- CreateIndex
CREATE INDEX "CooccurrenceEdge_userId_score_idx" ON "CooccurrenceEdge"("userId", "score");

-- CreateIndex
CREATE INDEX "CooccurrenceEdge_userId_computedAt_idx" ON "CooccurrenceEdge"("userId", "computedAt");

-- AddForeignKey
ALTER TABLE "CooccurrenceSchedule" ADD CONSTRAINT "CooccurrenceSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooccurrenceJob" ADD CONSTRAINT "CooccurrenceJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooccurrenceEdge" ADD CONSTRAINT "CooccurrenceEdge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
