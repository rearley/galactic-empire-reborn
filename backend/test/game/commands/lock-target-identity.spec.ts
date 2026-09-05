/**
 * A weapon lock must identify exactly ONE ship.
 *
 * In the original, `warsptr->lock` is a GLOBAL slot index into the ship array,
 * bounded by `nships` (GECMDS.C:1443) — unique across the whole game. The port
 * stores `target.shipno`, which is per-user and therefore ambiguous:
 *
 *   - every droid spawns with shipno 1 (droid-spawner.ts)
 *   - every player's FIRST ship is shipno 1
 *
 * `find-ship.ts` then resolves `@` with
 * `allShips.find(s => s.shipno === lock && key !== selfKey)`, so it returns
 * whichever shipno-1 ship happens to come first in map order — not necessarily
 * the one that was locked.
 *
 * Observed in a browser playtest: after `loc DiagTarget1` on a droid 100 units
 * away, `tor @` reported "Locked target out of scanner range" because the lock
 * resolved to a different shipno-1 droid on the far side of the galaxy.
 *
 * With several players connected — all holding shipno 1 — this misdirects live
 * fire, which makes it a correctness bug rather than a cosmetic one.
 */

import { findShip } from '../../../src/game/commands/helpers/find-ship';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';

function makeShip(over: Partial<ShipState>): ShipState {
  return {
    userid: 'u', shipno: 1, shipname: 'Ship', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: -1,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [0, 0, 0], items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: -1, holdcourse: 0, topspeed: 1, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
  } as ShipState;
}

const SCAN_RANGE = 15_000; // 1.5 sectors

describe('weapon lock identifies exactly one ship', () => {
  it('resolves @ to the ship that was locked, not another sharing its shipno', () => {
    const me = makeShip({ userid: 'me', shipno: 1, shipname: 'Mine', xcoord: 10, ycoord: 10 });
    // The intended target: adjacent, shipno 1.
    const near = makeShip({ userid: '@Droid-A', shipno: 1, shipname: 'NearTarget', xcoord: 10.01, ycoord: 10 });
    // A decoy sharing shipno 1, far outside scan range.
    const far = makeShip({ userid: '@Droid-B', shipno: 1, shipname: 'FarTarget', xcoord: 25, ycoord: 10 });

    // Map order puts the distant one first — exactly the situation observed.
    const allShips = [far, near, me];

    me.lock = near.shipno;
    me.lockKey = `${near.userid}:${near.shipno}`;

    const found = findShip('@', me, allShips, SCAN_RANGE);
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.ship.shipname).toBe('NearTarget');
  });

  it('still reports out-of-range when the LOCKED ship is genuinely far away', () => {
    const me = makeShip({ userid: 'me', shipno: 1, xcoord: 10, ycoord: 10 });
    const far = makeShip({ userid: '@Droid-B', shipno: 1, shipname: 'FarTarget', xcoord: 25, ycoord: 10 });

    me.lock = far.shipno;
    me.lockKey = `${far.userid}:${far.shipno}`;

    const found = findShip('@', me, [far, me], SCAN_RANGE);
    expect(found.ok).toBe(false);
    if (!found.ok) expect(found.message).toMatch(/out of scanner range/i);
  });

  it('falls back to shipno matching when no lockKey is recorded (legacy state)', () => {
    const me = makeShip({ userid: 'me', shipno: 1, xcoord: 10, ycoord: 10 });
    const near = makeShip({ userid: '@Droid-A', shipno: 4, shipname: 'NearTarget', xcoord: 10.01, ycoord: 10 });

    me.lock = 4;
    me.lockKey = undefined; // legacy state: no key recorded

    const found = findShip('@', me, [near, me], SCAN_RANGE);
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.ship.shipname).toBe('NearTarget');
  });
});
