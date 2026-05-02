-- CreateTable
CREATE TABLE "GedcomImportPreviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fileName" TEXT NOT NULL,
    "isArchive" BOOLEAN NOT NULL DEFAULT false,
    "gedcomUtf8" TEXT NOT NULL,
    "stagedArchivePath" TEXT,
    "indiRows" JSONB NOT NULL,
    "fams" JSONB NOT NULL,
    "media" JSONB NOT NULL,
    "archiveMediaFiles" JSONB,
    "lineLog" JSONB NOT NULL DEFAULT '[]',
    "famMatchError" TEXT,

    CONSTRAINT "GedcomImportPreviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GedcomImportPreviewSession_userId_createdAt_idx" ON "GedcomImportPreviewSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GedcomImportPreviewSession_expiresAt_idx" ON "GedcomImportPreviewSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "GedcomImportPreviewSession" ADD CONSTRAINT "GedcomImportPreviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
