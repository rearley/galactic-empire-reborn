import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { needsDatabase, selectedSpecs } from "./needs-database";

// Load .env before globalSetup so TEST_DATABASE_URL is available without manual env injection
const envPath = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] ??= match[2].trim().replace(/^"|"$/g, "");
  }
}

/**
 * Jest passes the resolved global config first and the project config second.
 * Only the fields this file reads are named, so a Jest upgrade that adds or
 * renames anything else cannot break the signature.
 */
interface GlobalConfigLike {
  testPathPatterns?: { patterns?: string[] };
}
interface ProjectConfigLike {
  roots?: string[];
}

/**
 * Is a reset warranted, or did someone ask for specs that never open a
 * connection?
 *
 * Skipping is only ever safe when the walk is CERTAIN, so every uncertainty
 * here means reset: no config, no selection, an empty selection, a spec whose
 * imports will not resolve. @see issue #23, and `needs-database.ts` for why
 * this is an import walk rather than a directory list.
 */
function runTouchesDatabase(
  globalConfig?: GlobalConfigLike,
  projectConfig?: ProjectConfigLike
): boolean {
  const roots = projectConfig?.roots;
  if (!roots || roots.length === 0) return true;
  const patterns = globalConfig?.testPathPatterns?.patterns ?? [];
  if (patterns.length === 0) return true;
  const specs = selectedSpecs(roots, patterns);
  if (specs.length === 0) return true;
  return specs.some(needsDatabase);
}

export default async function globalSetup(
  globalConfig?: GlobalConfigLike,
  projectConfig?: ProjectConfigLike
): Promise<void> {
  if (!runTouchesDatabase(globalConfig, projectConfig)) {
    // Say so. A silent skip is how someone concludes the reset is broken.
    console.log(
      "[global-setup] selected specs reach no database — skipping the ge_test reset"
    );
    return;
  }

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. " +
        "Copy .env.example to backend/.env and run `npm run db:up` first."
    );
  }

  const schemaPath = path.resolve(__dirname, "../../../prisma/schema.prisma");

  // Apply schema.prisma to the test DB and regenerate the Prisma client so
  // the generated query engine always matches the current schema.  The
  // --skip-generate flag was previously used here; that left a stale client
  // whenever a schema constraint was dropped (e.g. dropping @@unique([userid])
  // on Ship), causing ON CONFLICT to reference the old constraint → 42P10.
  // Uses --force-reset so each full run starts from a clean slate.
  execSync(
    `npx prisma db push --force-reset --schema="${schemaPath}"`,
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
  // Partial because the Cybertron rows have no email — see
  // prisma/migrations/20260907185450_user_email_lower_index/migration.sql.
  execSync(
    `psql "${url}" -c 'CREATE UNIQUE INDEX IF NOT EXISTS "user_email_lower_key" ON "User" (LOWER("email")) WHERE "email" IS NOT NULL'`,
    psqlOpts
  );
}
