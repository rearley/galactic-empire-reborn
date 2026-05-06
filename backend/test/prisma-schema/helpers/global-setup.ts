import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Load .env before globalSetup so TEST_DATABASE_URL is available without manual env injection
const envPath = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] ??= match[2].trim().replace(/^"|"$/g, "");
  }
}

export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. " +
        "Copy .env.example to backend/.env and run `npm run db:up` first."
    );
  }

  const schemaPath = path.resolve(__dirname, "../../../prisma/schema.prisma");

  // Apply schema.prisma to the test DB without generating the client.
  // Uses --force-reset so each full run starts from a clean slate.
  execSync(
    `npx prisma db push --force-reset --skip-generate --schema="${schemaPath}"`,
    {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
    }
  );

  // prisma db push applies the Prisma schema but not raw SQL from migration files.
  // Manually create case-insensitive unique indexes that require LOWER() expressions,
  // which Prisma cannot express natively in schema.prisma.
  const psqlOpts = { env: { ...process.env }, stdio: "inherit" as const };
  execSync(
    `psql "${url}" -c 'CREATE UNIQUE INDEX IF NOT EXISTS "User_username_lower_idx" ON "User" (LOWER("username"))'`,
    psqlOpts
  );
  execSync(
    `psql "${url}" -c 'CREATE UNIQUE INDEX IF NOT EXISTS "Ship_shipname_lower_idx" ON "Ship" (LOWER("shipname"))'`,
    psqlOpts
  );
}
