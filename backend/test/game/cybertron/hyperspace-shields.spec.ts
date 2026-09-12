import { pickPursuitBand } from '../../../src/game/cybertron/cyb-decisions';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';

/**
 * An AI at warp must be in hyperspace with its shields down, like everyone else.
 *
 * Canon writes `ptr->where` in exactly ONE place in the pursuit bands — the
 * hyperwarp band, which sets `where = 1` and `shieldstat = SHIELDDN`
 * (GECYBS.C:748 `		ptr->where = 1;`). The other three bands never touch it. The EXIT happens in
 * the shared movement code, when a ship decelerating crosses back under speed
 * 1000: `accel()` calls `hyperspace(ptr,usrn,0)` (GEFUNCS.C:538 `	if ((ptr->speed2b < 1000) && (ptr->speed/1000 >=1) && ((ptr->speed-decelrate)/1000 <1))`), which is
 * the same routine that dropped the shields on the way in at :481-483.
 *
 * That is why canon's combat band sets `speed2b` to 990 rather than to top
 * speed (GECYBS.C:796 `			ptr->speed2b = ((low_dist > .5) ? 990.0:rndm(500.0));`): a Cybertron that means to fight slows below warp 1
 * first, and only then does `if (ptr->where == 0) shieldup(...)` fire.
 *
 * The port wrote `ship.where = band.where` unconditionally, so a Cybertron
 * dropping from hyperwarp into the brake or close band was yanked to `where = 0`
 * at 3,200 units of speed — out of hyperspace by fiat, with the speed of a ship
 * that should still be in it. The next activation then read `currentWhere === 0`
 * and raised its shields. Reported from play: a Sarten Attack Drone scanned at
 * "Speed: Warp 3.20 / Shields: UP" while the player's own shields drop the
 * moment they pass warp 1. @see issue #42
 */
describe('the pursuit bands do not fake an exit from hyperspace', () => {
  const rand = new Mulberry32Adapter(1);
  const band = (distance: number, currentWhere: number) =>
    pickPursuitBand(distance, 10, 5, currentWhere, 8000, rand, { where: 0, speed2b: 0 });

  it('enters hyperwarp with shields down, which is the one where canon writes', () => {
    const b = band(50, 0);
    expect(b.where).toBe(1);
    expect(b.raiseShields).toBe(false);
    expect(b.shield).toBe(0);
  });

  it('does not claim a normal-space `where` while still in hyperspace', () => {
    // Brake, close and combat bands, each entered from hyperspace. None of them
    // may assert where=0: only deceleration below warp 1 leaves hyperspace.
    for (const distance of [7, 4, 2]) {
      const b = band(distance, 1);
      expect(`dist ${distance}: where=${String(b.where)}`).toBe(`dist ${distance}: where=undefined`);
    }
  });

  it('keeps shields down while the ship is still in hyperspace', () => {
    for (const distance of [7, 4, 2]) {
      expect(`dist ${distance}: raise=${band(distance, 1).raiseShields}`)
        .toBe(`dist ${distance}: raise=false`);
    }
  });

  it('raises them once the ship is genuinely in normal space', () => {
    // `if (ptr->where == 0) shieldup(ptr,usrn)` — GECYBS.C:783 `		if (ptr->where == 0)`, :802.
    expect(band(4, 0).raiseShields).toBe(true);
    expect(band(2, 0).raiseShields).toBe(true);
  });

  it('fights below warp 1, which is what makes shields legal there', () => {
    // GECYBS.C:796 `			ptr->speed2b = ((low_dist > .5) ? 990.0:rndm(500.0));` — 990, deliberately under the 1000 threshold.
    expect(band(2, 0).desiredSpeed).toBeLessThan(1000);
  });
});
