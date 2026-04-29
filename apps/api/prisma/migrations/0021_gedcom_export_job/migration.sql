-- CreateEnum
CREATE TYPE "GedcomExportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "GedcomExportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GedcomExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "redactLiving" BOOLEAN NOT NULL DEFAULT false,
    "includeTreemichCustomTags" BOOLEAN NOT NULL DEFAULT true,
    "byteSize" INTEGER,
    "gedcomUtf8" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GedcomExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GedcomExportJob_userId_createdAt_idx" ON "GedcomExportJob"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GedcomExportJob" ADD CONSTRAINT "GedcomExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
