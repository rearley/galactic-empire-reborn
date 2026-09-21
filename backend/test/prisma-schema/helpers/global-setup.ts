import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { needsDatabase, selectedSpecs } from "./needs-database";
import { loadDotenv } from "../../helpers/load-dotenv";
import { TEST_WORKERS } from "../../helpers/test-workers";

// Load .env before globalSetup so TEST_DATABASE_URL is available without manual
// env injection. The loader is shared with the manual suite's config, which
// needs the same env and none of this file's database reset. @see issue #37
loadDotenv();

/**
 * The two runner shapes this file has to understand.
 *
 * Jest calls `globalSetup(globalConfig, projectConfig)`; Vitest calls
 * `globalSetup(project)`. Both are supported because the Jest -> Vitest
 * migration is staged, and because a signature change here is silent — it does
 * not throw, it just stops matching and falls through to "reset every time".
 * That is safe but it quietly undoes issue #23, so both shapes are named
 * explicitly and a test asserts each one still resolves.
 *
 * Only the fields actually read are declared, so a runner upgrade that adds or
 * renames anything else cannot break the signature.
 */
interface JestGlobalConfigLike {
  testPathPatterns?: { patterns?: string[] };
}
interface JestProjectConfigLike {
  roots?: string[];
}
/** Vitest's `TestProject`. `filenamePattern` is its positional file filter. */
interface VitestProjectLike {
  config?: { root?: string };
  vitest?: { filenamePattern?: string[] };
}

/** The spec roots and path patterns a run selected, whichever runner called us. */
export function readSelection(
  first?: JestGlobalConfigLike | VitestProjectLike,
  second?: JestProjectConfigLike
): { roots: string[]; patterns: string[] } | null {
  const vitest = first as VitestProjectLike | undefined;
  if (vitest?.vitest || vitest?.config?.root) {
    const root = vitest.config?.root;
    if (!root) return null;
    return { roots: [path.join(root, "test")], patterns: vitest.vitest?.filenamePattern ?? [] };
  }

  const jest = first as JestGlobalConfigLike | undefined;
  const roots = second?.roots;
  if (!roots || roots.length === 0) return null;
  return { roots, patterns: jest?.testPathPatterns?.patterns ?? [] };
}

/**
 * Is a reset warranted, or did someone ask for specs that never open a
 * connection?
 *
 * Skipping is only ever safe when the walk is CERTAIN, so every uncertainty
 * here means reset: an unrecognised runner shape, no selection, an empty
 * selection, a spec whose imports will not resolve. @see issue #23, and
 * `needs-database.ts` for why this is an import walk rather than a directory
 * list.
 */
export function runTouchesDatabase(
  first?: JestGlobalConfigLike | VitestProjectLike,
  second?: JestProjectConfigLike
): boolean {
  const selection = readSelection(first, second);
  if (!selection) return true;
  if (selection.patterns.length === 0) return true;
  const specs = selectedSpecs(selection.roots, selection.patterns);
  if (specs.length === 0) return true;
  return specs.some(needsDatabase);
}

export default async function globalSetup(
  first?: JestGlobalConfigLike | VitestProjectLike,
  second?: JestProjectConfigLike
): Promise<void> {
  if (!runTouchesDatabase(first, second)) {
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

  // One database per worker, cloned from the one just built, so files can run
  // in parallel with nothing shared. A template clone is a file copy — well
  // under a second each — where a second `db push` per worker would cost
  // several. WITH (FORCE) drops a clone a crashed earlier run left connected.
  // @see ../../helpers/test-workers.ts, issue #51
  const base = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  for (let i = 1; i <= TEST_WORKERS; i++) {
    execSync(
      `psql "${admin.toString()}" -c 'DROP DATABASE IF EXISTS "${base}_${i}" WITH (FORCE)' -c 'CREATE DATABASE "${base}_${i}" TEMPLATE "${base}"'`,
      psqlOpts
    );
  }
}
