-- Migration: 011_onboarding_auth
-- Adds username, passwordHash, createdAt to User; case-insensitive unique indexes.
--
-- Backfill policy (b): username is backfilled from userid for existing rows so the
--   NOT NULL constraint can be applied. Pre-existing rows have no passwordHash and
--   CANNOT log in — AuthService.login rejects users with a NULL passwordHash as
--   INVALID_CREDENTIALS. This is acceptable because no production data exists yet;
--   dev DBs are wiped freely. Policy documented in docs/DECISIONS.md.
-- Nullable policy (d): passwordHash stays nullable at the DB level. The service
--   layer rejects logins with NULL hashes, enforcing the constraint in code.

-- Step 1: Add columns as nullable initially
ALTER TABLE "User"
  ADD COLUMN "username"     TEXT,
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 2: Backfill username from userid for all existing rows
UPDATE "User" SET "username" = "userid" WHERE "username" IS NULL;

-- Step 3: Enforce NOT NULL on username
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- Step 4: Case-insensitive unique index on username
CREATE UNIQUE INDEX "User_username_lower_idx" ON "User" (LOWER("username"));

-- Step 5: Fast lookup index on username (non-unique, for login query)
CREATE INDEX "User_username_idx" ON "User" ("username");

-- Step 6: Case-insensitive unique index on shipname
CREATE UNIQUE INDEX "Ship_shipname_lower_idx" ON "Ship" (LOWER("shipname"));

-- Step 7: One-ship-per-user unique constraint
ALTER TABLE "Ship" ADD CONSTRAINT "Ship_userid_key" UNIQUE ("userid");
