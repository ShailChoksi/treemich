-- CreateEnum
CREATE TYPE "GedcomImportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "GedcomImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GedcomImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL DEFAULT 'import.ged',
    "byteSize" INTEGER NOT NULL,
    "gedcomUtf8" TEXT NOT NULL,
    "indiMatches" JSONB NOT NULL DEFAULT '{}',
    "importOptions" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "lineLog" JSONB NOT NULL DEFAULT '[]',
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GedcomImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GedcomImportJob_userId_createdAt_idx" ON "GedcomImportJob"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GedcomImportJob" ADD CONSTRAINT "GedcomImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
