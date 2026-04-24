-- One-shot data migration bookkeeping (e.g. automatic Phase 4 family backfill on first API boot).
CREATE TABLE "DataMigrationCheckpoint" (
    "id" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataMigrationCheckpoint_pkey" PRIMARY KEY ("id")
);
