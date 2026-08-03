-- Clean up duplicate TreemichUser rows with same email before adding unique index.
-- Keeps the row with the most profiles (matching pickPasswordLoginUser logic),
-- then the most recently updated, then the lowest ID.
DELETE FROM "TreemichUser"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT
      "id",
      "email",
      ROW_NUMBER() OVER (
        PARTITION BY "email"
        ORDER BY
          (SELECT COUNT(*) FROM "PersonProfile" WHERE "userId" = "TreemichUser"."id") DESC,
          "updatedAt" DESC,
          "id" ASC
      ) AS rn
    FROM "TreemichUser"
    WHERE "email" IS NOT NULL
  ) dupes
  WHERE dupes.rn > 1
);

-- Add the unique constraint on email to prevent duplicate email rows
-- in concurrent signup race conditions.
CREATE UNIQUE INDEX "TreemichUser_email_key" ON "TreemichUser"("email");
