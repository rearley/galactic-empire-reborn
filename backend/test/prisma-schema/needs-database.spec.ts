/**
 * The classifier that decides whether a Jest invocation may reset `ge_test`.
 *
 * Global setup ran `prisma db push --force-reset` for EVERY invocation,
 * including a single read-only spec. `npx jest canon-citations.balance.spec.ts`
 * reads files off disk and counts strings; running it alone still wiped the
 * shared database out from under anything else using it. @see issue #23
 *
 * This is the guard for the classifier, and the thing it has to get right is
 * the direction it fails in: an unknown answer must mean "reset", never "skip".
 * A wrong skip is a suite that fails confusingly against stale state; a wrong
 * reset is only slow.
 */
import { join, resolve } from 'node:path';
import { needsDatabase, selectedSpecs, unresolvedImports } from './helpers/needs-database';

const BACKEND = resolve(__dirname, '../..');
const ROOTS = [join(BACKEND, 'test')];

const spec = (p: string) => join(BACKEND, p);

describe('needsDatabase', () => {
  it('says no for a spec that only reads files', () => {
    expect(needsDatabase(spec('test/balance/canon-citations.balance.spec.ts'))).toBe(false);
    expect(needsDatabase(spec('test/invariants/fixture-domains.spec.ts'))).toBe(false);
  });

  it('says yes for a spec that reaches Prisma through its imports', () => {
    expect(needsDatabase(spec('test/prisma-schema/planet.spec.ts'))).toBe(true);
  });

  it('follows imports transitively, not just the spec is own line', () => {
    // The spec below never writes the word Prisma. It reaches the database
    // through the service graph it imports, which is the whole reason this is
    // a walk and not a grep.
    const viaGraph = spec('test/integration/scan-ra-gateway.spec.ts');
    expect(/prisma/i.test(require('node:fs').readFileSync(viaGraph, 'utf8').split('\n')[0])).toBe(
      false,
    );
    expect(needsDatabase(viaGraph)).toBe(true);
  });

  it('treats an import it cannot resolve as needing the database', () => {
    // Fail CLOSED. If the walk cannot see where an import leads, it must not
    // conclude the spec is database-free.
    expect(needsDatabase(spec('test/prisma-schema/helpers/__nonexistent__.ts'))).toBe(true);
  });

  it('resolves every relative import in the current test tree', () => {
    // If this starts failing, the resolver has a gap and is quietly answering
    // "needs the database" for files it simply could not read.
    expect(unresolvedImports(selectedSpecs(ROOTS, []))).toEqual([]);
  });

  it('is not degenerate — the tree splits both ways', () => {
    const all = selectedSpecs(ROOTS, []);
    const dbFree = all.filter((f) => !needsDatabase(f));
    expect(all.length).toBeGreaterThan(300);
    expect(dbFree.length).toBeGreaterThan(10);
    expect(all.length - dbFree.length).toBeGreaterThan(200);
  });
});

describe('selectedSpecs', () => {
  it('returns every spec when no pattern was given', () => {
    expect(selectedSpecs(ROOTS, []).length).toBeGreaterThan(300);
  });

  it('applies a Jest path pattern as a regex against the absolute path', () => {
    const got = selectedSpecs(ROOTS, ['balance/canon-citations']);
    expect(got).toEqual([spec('test/balance/canon-citations.balance.spec.ts')]);
  });

  it('unions multiple patterns, as Jest does', () => {
    const got = selectedSpecs(ROOTS, ['balance/canon-citations', 'invariants/fixture-domains']);
    expect(got).toHaveLength(2);
  });

  it('ignores a pattern that is not a valid regex rather than throwing', () => {
    // A bad pattern must not take the suite down before it starts, and the
    // safe reading of "I could not tell what you selected" is everything.
    expect(selectedSpecs(ROOTS, ['(']).length).toBeGreaterThan(300);
  });
});
