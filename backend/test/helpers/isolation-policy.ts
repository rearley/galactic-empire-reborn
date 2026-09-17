/**
 * Which spec files must keep their own module graph.
 *
 * `isolate: false` evaluates each module once per WORKER rather than once per
 * FILE, which took the suite from 283s to ~89s. The cost is that anything
 * living outside a test's own scope is now shared between files, and three
 * kinds of thing do:
 *
 * 1. **`vi.mock`** registers against the module graph. Sharing the graph shares
 *    the mock. Four specs in ~670 use it, and the clearest symptom was
 *    `integration/auth/login.spec.ts` asserting bcrypt's constant-time path
 *    takes >= 100ms and measuring 7ms — it had picked up another file's stub.
 *    This is how Vitest mocks work, not a hygiene problem, so these files can
 *    never share.
 *
 * 2. **`process.env`** is per-PROCESS, so a spec that assigns to it races every
 *    spec that reads it. `unit/prisma/database-url.spec.ts` failed once in four
 *    runs this way and passed the other three — the failure mode this whole
 *    split has to avoid producing.
 *
 * 3. **A Nest testing module** brings the framework's own registries and any
 *    module-scope seam its providers install. `CommandsModule.onModuleInit`
 *    calls `setIonTrailObserverSource` (`impulse.handler.ts:168`), a deliberate
 *    global because `impulseCommand` is a plain literal with no DI — correct in
 *    production, where exactly one CommandsModule exists, and not correct when
 *    a worker builds fifty of them. `impulse.spec.ts` ran against another
 *    spec's class cache and threw `ShipClass 21 not in cache`.
 *
 * **This is computed, not listed.** A hand-maintained array would be a snapshot
 * of the failures observed on one afternoon, and the next spec to stub an env
 * var would join the shared project silently and fail intermittently in CI
 * months later — which is precisely the hazard that made issue #51 cautious.
 * Reading the rule off the file means a spec classifies itself.
 *
 * It FAILS CLOSED, the same property `needs-database.ts` protects: an
 * unreadable file is isolated. The worst outcome is a file that runs slower
 * than it needed to; the opposite mistake is a flake nobody can reproduce.
 *
 * @see https://github.com/rearley/galactic-empire-reborn/issues/51
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Each pattern is anchored so a mention in prose does not count. The docblock
 * above names `vi.mock` and `process.env` repeatedly and must not classify
 * THIS file's readers by talking about them.
 */
const ISOLATION_MARKERS: readonly RegExp[] = [
  // Module mocking, in any of the forms that register against the graph.
  /^\s*vi\.(mock|doMock|unmock|doUnmock)\s*\(/m,
  // Process-wide environment, written or stubbed. Reading it is enough to be a
  // VICTIM, so reads count too — database-url.spec.ts only reads.
  /^\s*vi\.stubEnv\s*\(/m,
  /process\.env\s*\[/,
  /process\.env\.[A-Z_]/,
  // A Nest module, which carries the framework's registries and whatever
  // module-scope seams its providers install.
  /Test\.createTestingModule\s*\(/,
  /NestFactory\./,
];

/** Does running this spec require its own module graph? */
export function requiresIsolation(specPath: string): boolean {
  let text: string;
  try {
    text = readFileSync(specPath, 'utf8');
  } catch {
    return true; // fail closed
  }
  return ISOLATION_MARKERS.some((re) => re.test(text));
}

/** Every `*.spec.ts` under `dir`, recursively. */
export function allSpecs(dir: string, out: string[] = []): string[] {
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
 * The directories the main suite runs, enumerated rather than globbed from
 * `test/` wholesale.
 *
 * This is the previous config's `include` list, kept verbatim for one reason:
 * `test/manual/` is NOT in it. The manual suite has its own config and its own
 * `test:manual` script, and an earlier draft of this file scanned `test/`
 * recursively and quietly pulled `T053.manual.spec.ts` into every `npm test`.
 * Five tests appeared that had never run in the main suite, which is a change
 * to what CI checks, smuggled in by a performance refactor.
 */
const SUITE_ROOTS: readonly string[] = [
  'test/prisma-schema',
  'test/auth',
  'test/unit',
  'test/integration',
  'test/e2e',
  'test/game',
  'test/gateway',
  'test/helpers',
  'test/balance',
  'test/mail',
  'test/team',
  'test/invariants',
  'test/public',
];

/**
 * The two include lists, as paths relative to `root` so Vitest's own
 * include/exclude matching sees the same strings it would have globbed.
 *
 * Their union is exactly what the single `include` list selected before the
 * split — `test/helpers/suite-membership.spec.ts` asserts that, so a future
 * edit here cannot silently add or drop a file from the suite.
 */
export function splitSpecs(root: string): { isolated: string[]; shared: string[] } {
  const isolated: string[] = [];
  const shared: string[] = [];
  for (const suiteRoot of SUITE_ROOTS) {
    for (const abs of allSpecs(join(root, suiteRoot))) {
      const rel = relative(root, abs);
      (requiresIsolation(abs) ? isolated : shared).push(rel);
    }
  }
  return { isolated, shared };
}
