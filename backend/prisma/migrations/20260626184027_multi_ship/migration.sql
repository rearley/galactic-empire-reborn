-- AlterTable: drop the one-ship-per-user unique constraint from Ship.
-- The index is backed by a constraint, so we must DROP CONSTRAINT (not DROP INDEX).
ALTER TABLE "Ship" DROP CONSTRAINT "Ship_userid_key";

-- Backfill fleet counters for existing users (all currently own exactly one ship).
UPDATE "User" u SET
  "noships"   = (SELECT COUNT(*)                 FROM "Ship" s WHERE s."userid" = u."userid"),
  "topshipno" = COALESCE((SELECT MAX(s."shipno") FROM "Ship" s WHERE s."userid" = u."userid"), 0);
