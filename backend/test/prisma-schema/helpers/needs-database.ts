/**
 * Does this Jest invocation actually touch the database?
 *
 * Global setup ran `prisma db push --force-reset` against the shared `ge_test`
 * database for EVERY invocation, including a single read-only spec.
 * `npx jest canon-citations.balance.spec.ts` reads files off disk and counts
 * strings; running it alone still wiped state another process was relying on,
 * with no warning and no reason for the person running it to expect one.
 *
 * This project already has one incident in that family — two concurrent Jest
 * processes racing `ge_test` produced two interleaved, disagreeing summaries in
 * one output file, which was initially misread as a flake. This is the same
 * hazard from the other direction: one run with a side effect far wider than
 * what it was asked to do. @see issue #23
 *
 * The classification is a transitive import walk, because the signal is not
 * local. `test/integration/scan-ra-gateway.spec.ts` never writes the word
 * Prisma and needs the database anyway, through the service graph it imports.
 *
 * IT FAILS CLOSED, and that is the property to preserve. Every uncertainty —
 * an import that will not resolve, a pattern that is not a valid regex, a file
 * that cannot be read — resolves to "needs the database", so the worst outcome
 * is a reset that was not required. The opposite mistake runs a suite against
 * stale state and reports failures that have nothing to do with the code.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** `from '…'`, `require('…')` and `import('…')`, which is every form used here. */
const IMPORT_RE = /(?:from\s*|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;

/**
 * A module specifier that means the database.
 *
 * `@prisma/client` is the generated client. Anything with `prisma` in its path
 * is this repo's own `PrismaService` and the modules that carry it. Matching
 * the specifier rather than the file contents is what lets the walk stop at the
 * boundary instead of reading node_modules.
 */
const DB_SPECIFIER = /(^@prisma\/)|(^|\/)prisma(\/|\.|$)/i;

const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'];

function readFile(p: string): string | null {
  try {
    if (!statSync(p).isFile()) return null;
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/** The file a relative specifier points at, or null if the walk cannot tell. */
function resolveRelative(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const p = base + suffix;
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      // next candidate
    }
  }
  return null;
}

interface WalkResult {
  needsDb: boolean;
  unresolved: string[];
}

function walk(entry: string): WalkResult {
  const seen = new Set<string>();
  const unresolved: string[] = [];
  const queue = [entry];
  let needsDb = false;

  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const text = readFile(file);
    if (text === null) {
      unresolved.push(file);
      needsDb = true;
      continue;
    }

    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (DB_SPECIFIER.test(spec)) {
        needsDb = true;
        continue;
      }
      // A bare package specifier stops the walk: it is node_modules, and the
      // only package that means the database is matched above.
      if (!spec.startsWith('.')) continue;
      const target = resolveRelative(file, spec);
      if (target === null) {
        unresolved.push(`${file} → ${spec}`);
        needsDb = true;
        continue;
      }
      queue.push(target);
    }
  }

  return { needsDb, unresolved };
}

/** Does running `specPath` reach the database, directly or through its imports? */
export function needsDatabase(specPath: string): boolean {
  return walk(specPath).needsDb;
}

/**
 * Every import the walk could not follow, across `specPaths`.
 *
 * Exported so a test can assert the resolver has no gap. Without that, the walk
 * could answer "needs the database" for a whole tree it simply failed to read,
 * and the guard would look like it was working.
 */
export function unresolvedImports(specPaths: string[]): string[] {
  const out = new Set<string>();
  for (const p of specPaths) for (const u of walk(p).unresolved) out.add(u);
  return [...out];
}

function allSpecs(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) allSpecs(p, out);
    else if (p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

/**
 * The spec files a Jest invocation selected.
 *
 * `patterns` is `globalConfig.testPathPatterns.patterns` — Jest treats each as
 * a regex against the absolute path and takes their union. An empty list means
 * a full run. A pattern that will not compile is DROPPED rather than thrown,
 * and dropping every pattern leaves the full list, which is the fail-closed
 * reading of "I could not tell what you selected".
 */
export function selectedSpecs(roots: string[], patterns: string[]): string[] {
  const files = roots.flatMap((r) => allSpecs(r)).sort();
  const regexes: RegExp[] = [];
  for (const p of patterns) {
    try {
      regexes.push(new RegExp(p));
    } catch {
      // An uncompilable pattern selects nothing rather than everything, so it
      // must not narrow the run.
    }
  }
  if (regexes.length === 0) return files;
  return files.filter((f) => regexes.some((re) => re.test(f)));
}
