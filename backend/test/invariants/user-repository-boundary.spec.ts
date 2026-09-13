/**
 * The `User` persistence boundary, kept shut.
 *
 * Phase 3 moved 41 of 53 `prisma.user.*` calls behind `UserRepository`. Nothing
 * stopped the 42nd: eleven classes still hold BOTH a `PrismaService` and a
 * `UserRepository`, so writing `this.prisma.user.update(...)` in one of them
 * compiles, passes lint, and passes every other test in the suite. The boundary
 * would then erode one call at a time, each one invisible in its own diff —
 * which is exactly how the 53 accumulated in the first place.
 *
 * So the permitted files are named here. Adding one is a deliberate edit to
 * this list with a reason, not a drive-by.
 *
 * `escalation-user-kills.spec.ts` is the precedent for this style: a source-text
 * assertion is the only way to state "this code must not exist anywhere", and a
 * runtime test cannot.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname, '../../src');

/**
 * Every file allowed to issue `prisma.user.*`, and why.
 *
 * Five repositories plus one service. The four beyond `UserRepository` are not
 * oversights — each was examined during the migration and left where it is:
 *
 *  - `cybertron.repository.ts` — Cybertron hydration (`include: { ships: true }`)
 *    and the `CYB_MAXCASH` clamp-on-load, neither of which is a plain `User`
 *    read. Its `flushUsersImmediate` touches real players' cash as well.
 *  - `team.repository.ts` — the `groupBy` counting live members per team.
 *  - `player-score.repository.ts` — `rospos`, owned by the midnight job.
 *  - `auth.service.ts` — account lifecycle (register, login, choose username).
 *    It reads `email` and `passwordHash`, runs before a captain exists, and is
 *    a bounded context the game depends on rather than the reverse; routing it
 *    through `UserRepository` would make `AuthModule` import a `src/game/`
 *    module. It wants its own `AuthUserRepository`.
 */
const PERMITTED = new Set([
  'game/player/user.repository.ts',
  'game/cybertron/cybertron.repository.ts',
  'game/team/team.repository.ts',
  'game/player/player-score.repository.ts',
  'auth/auth.service.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * `prisma.user.` in CODE, not in a comment describing it.
 *
 * Line-wise rather than one whole-file regex, because this file's own
 * docblocks — and several of the migrated ones — talk about `prisma.user.*` in
 * prose, and a file-wide match would flag every one of them.
 */
function callsUserDelegate(text: string): boolean {
  return text
    .split('\n')
    // Whole-line comments only: a trailing `// comment` on a code line (e.g.
    // `someCall(); // see this.prisma.user.update(...)`) is NOT stripped and
    // would false-positive this guard. Fails loud and in the safe direction,
    // which is the right trade for a grep guard — left as-is, documented here.
    .map((line) => line.replace(/^\s*(\*|\/\/).*$/, '')) // drop comment lines
    .some((line) => /\bprisma\.user\.[a-zA-Z]/.test(line));
}

describe('the User persistence boundary', () => {
  const files = walk(SRC);

  it('has a source tree to check at all', () => {
    // Guard the guard: a bad path here would make every assertion vacuous.
    expect(files.length).toBeGreaterThan(100);
  });

  it('touches prisma.user only in the files named above', () => {
    const offenders = files
      .filter((f) => callsUserDelegate(readFileSync(f, 'utf8')))
      .map((f) => f.replace(`${SRC}/`, ''))
      .filter((rel) => !PERMITTED.has(rel))
      .sort();

    // How to fix a failure here: add a method to `UserRepository` and call it.
    // If the call genuinely cannot go through the repository, add the file to
    // PERMITTED above WITH a reason — the list is the documentation.
    expect(offenders).toEqual([]);
  });

  it('still finds a call in every file it permits', () => {
    // The mirror. Without this the list rots: a file that stops calling
    // prisma.user stays permitted forever, and the next person to add a call
    // there finds the boundary already open.
    const dead = [...PERMITTED].filter(
      (rel) => !callsUserDelegate(readFileSync(join(SRC, rel), 'utf8')),
    );
    expect(dead).toEqual([]);
  });
});
