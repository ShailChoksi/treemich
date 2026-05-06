-- AlterTable
ALTER TABLE "TreemichUser" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TreemichUser" ADD COLUMN "passwordChangeRequired" BOOLEAN NOT NULL DEFAULT false;
