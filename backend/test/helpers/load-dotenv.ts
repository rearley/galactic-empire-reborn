/**
 * Load the repo's `.env` into `process.env`, without overwriting anything
 * already set.
 *
 * Prisma 7 dropped automatic `.env` loading, and the runner does not do it
 * either, so every entry point that needs `DATABASE_URL` or
 * `TEST_DATABASE_URL` has to ask. The main suite asks inside its global setup;
 * the MANUAL suite deliberately skips that setup — it runs against a live stack
 * and resetting `ge_test` underneath one is the opposite of what those specs are
 * for — so it had no env at all and `T053.manual.spec.ts` threw at import with
 * "makePrismaClient was given no connection string". The loader is here, once,
 * so both can use it. @see issue #37
 *
 * Deliberately not `dotenv`: this runs before the test module is imported, in
 * both runners, and a five-line parser has no resolution order to get wrong.
 * `??=` means a variable already in the environment wins, which is how CI
 * passes its own database URL.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `backend/.env`, which is where this project keeps it — two levels up from
// test/helpers, not three. The global setup's own copy of this loader resolved
// three levels up from a directory one level deeper, which landed on the same
// file by coincidence of depth; spelling it once removes that coincidence.
const DEFAULT_ENV = resolve(__dirname, '../../.env');

export function loadDotenv(from = DEFAULT_ENV): void {
  if (!existsSync(from)) return;
  for (const line of readFileSync(from, 'utf8').split('\n')) {
    const match = /^([^#=]+)=(.*)$/.exec(line);
    if (match) process.env[match[1].trim()] ??= match[2].trim().replace(/^"|"$/g, '');
  }
}

// Importing this file loads the env: that is what makes it usable as a Vitest
// `setupFiles` entry as well as a plain function.
loadDotenv();
