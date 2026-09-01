/**
 * Fly into a planet and you die. Fly into a wormhole and you come out
 * somewhere else, shaken.
 *
 * GEFUNCS.C:836-905 `gravity(ptr,usrn)`, called from `moveship` on every move
 * (GEFUNCS.C:794-795). `dist` is raw units — `cdistance(...) * 10000` — so the
 * bands are extremely tight, a few hundredths of a sector:
 *
 *   50 <= dist < 250   GRAVITY1 / GRAVWRM1   "you feel a tug"
 *   25 <= dist <  50   GRAVITY2 / GRAVWRM2   stronger warning
 *        dist <  25    GRAVITY3 / GRAVWRM3   and then:
 *                        planet   -> damage = 101.0        (destroyed)
 *                        wormhole -> coord = destination,
 *                                    damage += 5.5,
 *                                    cleartm() (torps and missiles cleared)
 *
 * Neither mechanic existed in the port — `grep -i gravity` over the backend
 * returned nothing, and the wormhole rows the galaxy generator writes were
 * never read by anything. Two whole mechanics were absent, one of them the
 * only in-game reason to be careful where you point a warp run.
 */

import { checkGravity } from '../../../src/game/physics/gravity';
import { PLTYPE_PLNT, PLTYPE_WORM } from '../../../src/game/constants';

const SHIP = { xcoord: 5.0, ycoord: 5.0 };

/** A body `raw` units away along x — raw units are sectors * 10_000. */
function bodyAt(raw: number, type: number, dest = { xcoord: 20, ycoord: 3 }) {
  return { xcoord: 5.0 + raw / 10_000, ycoord: 5.0, plnum: 1, type, destination: dest };
}

describe('checkGravity — GEFUNCS.C:846-900', () => {
  it('does nothing beyond 250 raw units', () => {
    expect(checkGravity(SHIP, [bodyAt(300, PLTYPE_PLNT)])).toEqual([]);
  });

  it('warns in the 50..250 band without harm', () => {
    const [e] = checkGravity(SHIP, [bodyAt(100, PLTYPE_PLNT)]);
    expect(e.band).toBe(1);
    expect(e.effect).toBeUndefined();
  });

  it('warns harder in the 25..50 band', () => {
    const [e] = checkGravity(SHIP, [bodyAt(30, PLTYPE_PLNT)]);
    expect(e.band).toBe(2);
    expect(e.effect).toBeUndefined();
  });

  it('destroys a ship that reaches a planet — damage = 101', () => {
    const [e] = checkGravity(SHIP, [bodyAt(10, PLTYPE_PLNT)]);
    expect(e.band).toBe(3);
    expect(e.effect).toEqual({ kind: 'crash', damage: 101 });
  });

  it('throws a ship through a wormhole, damaged and unlocked', () => {
    const [e] = checkGravity(SHIP, [bodyAt(10, PLTYPE_WORM, { xcoord: 12.5, ycoord: 2.25 })]);
    expect(e.band).toBe(3);
    expect(e.effect).toEqual({
      kind: 'wormhole',
      destination: { xcoord: 12.5, ycoord: 2.25 },
      damage: 5.5,
      clearProjectiles: true,
    });
  });

  it('distinguishes a wormhole from a planet in the warning bands', () => {
    expect(checkGravity(SHIP, [bodyAt(100, PLTYPE_WORM)])[0].isWormhole).toBe(true);
    expect(checkGravity(SHIP, [bodyAt(100, PLTYPE_PLNT)])[0].isWormhole).toBe(false);
  });

  it('ignores empty planet slots (type 0)', () => {
    expect(checkGravity(SHIP, [bodyAt(10, 0)])).toEqual([]);
  });

  it('reports the body number so the message can name it', () => {
    const [e] = checkGravity(SHIP, [{ ...bodyAt(10, PLTYPE_PLNT), plnum: 4 }]);
    expect(e.plnum).toBe(4);
  });

  it('checks every body in the sector, not just the first', () => {
    const events = checkGravity(SHIP, [
      bodyAt(5000, PLTYPE_PLNT),
      bodyAt(100, PLTYPE_PLNT),
      bodyAt(10, PLTYPE_WORM),
    ]);
    expect(events).toHaveLength(2);
  });
});
