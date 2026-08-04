-- CreateTable
CREATE TABLE "FocusShare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "label" TEXT,
    "focusAnchorPersonId" TEXT NOT NULL,
    "maxAncestorDepth" INTEGER NOT NULL,
    "maxDescendantDepth" INTEGER NOT NULL,
    "maxCollateralDepth" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FocusShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusShareGuestSession" (
    "id" TEXT NOT NULL,
    "focusShareId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FocusShareGuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FocusShare_publicId_key" ON "FocusShare"("publicId");

-- CreateIndex
CREATE INDEX "FocusShare_userId_idx" ON "FocusShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FocusShareGuestSession_tokenHash_key" ON "FocusShareGuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "FocusShareGuestSession_focusShareId_idx" ON "FocusShareGuestSession"("focusShareId");

-- CreateIndex
CREATE INDEX "FocusShareGuestSession_expiresAt_idx" ON "FocusShareGuestSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "FocusShare" ADD CONSTRAINT "FocusShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TreemichUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusShare" ADD CONSTRAINT "FocusShare_focusAnchorPersonId_fkey" FOREIGN KEY ("focusAnchorPersonId") REFERENCES "PersonProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusShareGuestSession" ADD CONSTRAINT "FocusShareGuestSession_focusShareId_fkey" FOREIGN KEY ("focusShareId") REFERENCES "FocusShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
