-- Prisma's @unique can express neither lower() nor a WHERE clause, so the index
-- that actually enforces "one account per email address, case-insensitively" is
-- written by hand. Partial because the 24 Cybertron rows have no email.
--
-- Its own migration rather than an edit to the generated one: that file is
-- already applied and checksummed, and editing it would force a migrate reset.
CREATE UNIQUE INDEX "user_email_lower_key"
  ON "User" (lower(email)) WHERE email IS NOT NULL;
