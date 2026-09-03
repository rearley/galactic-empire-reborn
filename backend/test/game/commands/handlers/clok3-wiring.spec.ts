/**
 * CLOK3's observer source must actually be installed, and must sweep the right ships.
 *
 * `cloakIonTrailReports` was written, tested and correct — and nothing in the
 * running game ever called it, because `setIonTrailObserverSource` had no
 * production caller. A cloaked captain opening the throttle leaked nothing, and
 * every test passed.
 *
 * Two assertions: the mapping is right, and the seam is actually used by src/.
 * The second is crude on purpose — the failure it guards against is not a wrong
 * value, it is a feature that exists and is never reached.
 *
 * @see GECMDS.C:524-546 cmd_impulse
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ionTrailObserversFrom } from '../../../../src/game/commands/handlers/impulse.handler';
import type { ShipState } from '../../../../src/game/ship/ship-state.types';

const ship = (over: Partial<ShipState>): ShipState => ({
  userid: 'u', shipno: 1, shpclass: 1, xcoord: 5, ycoord: 5, heading: 0, jammer: 0,
  ...over,
} as ShipState);

describe('CLOK3 observer source', () => {
  it('excludes the cloaked ship itself — canon skips zothusn == usrnum', () => {
    const mover = ship({ userid: 'cloaked', shipno: 2 });
    const out = ionTrailObserversFrom(
      [mover, ship({ userid: 'cloaked', shipno: 3 }), ship({ userid: 'watcher' })],
      () => 50_000,
      mover,
    );
    // The mover's OTHER hull is a different ship and still hears it — canon
    // excludes a channel, not a captain.
    expect(out.map((o) => `${o.userid}:${o.shipno}`)).toEqual(['cloaked:3', 'watcher:1']);
  });

  it("gives each observer its OWN class's scan range, not the mover's", () => {
    // GECMDS.C:534 reads shipclass[wptr->shpclass].scanrange — wptr is the
    // observer. A big hull hears things a starter never will.
    const out = ionTrailObserversFrom(
      [ship({ userid: 'small', shpclass: 1 }), ship({ userid: 'big', shpclass: 9 })],
      (c) => c * 10_000,
      ship({ userid: 'cloaked', shipno: 99 }),
    );
    expect(out.map((o) => o.scanrange)).toEqual([10_000, 90_000]);
  });

  it('carries the jammer flag through, since a jammed observer is deaf to it', () => {
    const out = ionTrailObserversFrom(
      [ship({ userid: 'deaf', jammer: 1 })], () => 50_000, ship({ userid: 'x', shipno: 9 }),
    );
    expect(out[0].jammer).toBe(1);
  });

  it('is installed by production code, not only by tests', () => {
    const SRC = resolve(__dirname, '../../../../src/game');
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
    });
    const callers = walk(SRC).filter(
      (f) => !f.endsWith('impulse.handler.ts')
        // Word-boundary anchored: without the lookbehind, renaming the call to
        // `_disabled_setIonTrailObserverSource(` still matched and the mutation
        // test passed.
        && /(?<![\w$])setIonTrailObserverSource\s*\(/.test(readFileSync(f, 'utf8')),
    );
    expect(callers.length).toBeGreaterThan(0);
  });
});
