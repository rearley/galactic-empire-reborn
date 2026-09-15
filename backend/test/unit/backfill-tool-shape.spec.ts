/**
 * The wormhole backfill has to survive contact with a live database.
 *
 * Its logic is `planReturnWormholes`, which is tested directly in
 * `wormhole-pairing.spec.ts`. What is pinned HERE is the glue, because all
 * three ways the first version failed were glue rather than logic, and each
 * failed only against production — never in a unit test:
 *
 *   1. `new PrismaClient()` with no driver adapter. Prisma 7 removed
 *      `datasources`, so the client throws on construction.
 *   2. One `updateMany` per receiving sector — 4 235 round trips against
 *      Prisma's FIVE SECOND default interactive-transaction timeout.
 *      `galaxy.service.ts` already records that timeout killing generation.
 *   3. No undo list. An insert-only change is reversible only if you know
 *      which rows were yours.
 *
 * Source assertions rather than execution, because running the tool means
 * having a galaxy to run it against. The precedent is `ci-build-inputs.spec.ts`
 * and the `dockerfile-*` specs: pin the shape of a thing the suite cannot
 * execute, so it cannot silently regress.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const src = readFileSync(
  resolve(__dirname, '../../tools/backfill-wormhole-returns.ts'),
  'utf8',
);

describe('backfill-wormhole-returns', () => {
  it('constructs the client with a driver adapter', () => {
    // Prisma 7: a bare `new PrismaClient()` cannot connect at all.
    expect(src).toMatch(/new PrismaClient\(\{\s*adapter:\s*new PrismaPg/);
    // Scoped to a CONSTRUCTION site: the header documents the broken form.
    expect(src).not.toMatch(/=\s*new PrismaClient\(\)/);
  });

  it('sets an explicit transaction timeout', () => {
    // The default is 5s and this writes thousands of rows.
    expect(src).toMatch(/timeout:\s*TX_TIMEOUT_MS/);
    expect(src).toMatch(/TX_TIMEOUT_MS\s*=\s*[\d_]+/);
  });

  it('renumbers sectors in one statement, not one per sector', () => {
    // The specific shape that blew the timeout: `await` on a write inside a
    // loop over sectors. One UPDATE ... FROM (VALUES ...) replaces all of them.
    expect(src).toMatch(/UPDATE "Sector"/);
    expect(src).not.toMatch(/for \([^)]*perSector[^)]*\)[\s\S]{0,200}?updateMany/);
  });

  it('writes the undo list BEFORE the transaction', () => {
    const undo = src.indexOf('writeFileSync');
    const tx = src.indexOf('$transaction');
    expect(undo).toBeGreaterThan(-1);
    expect(tx).toBeGreaterThan(-1);
    expect(undo).toBeLessThan(tx);
  });

  it('is a dry run unless --apply is passed', () => {
    expect(src).toMatch(/process\.argv\.includes\('--apply'\)/);
    expect(src).toMatch(/DRY RUN/);
  });

  it('re-checks the planner’s invariants before writing', () => {
    // Cheap, and the difference between a bad plan and a bad galaxy.
    expect(src).toMatch(/violations/);
    expect(src).toMatch(/refusing to write/);
  });

  it('reads maxplanets from the galaxy rather than assuming canon', () => {
    // This galaxy runs 5, not canon's 9. Assuming 9 would overfill sectors.
    expect(src).toMatch(/meta\.maxplanets \?\? FALLBACK_MAXPLANETS/);
  });
});
