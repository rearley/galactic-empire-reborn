/**
 * Mine blast radius must be compared in RAW units, not sectors.
 *
 * GEFUNCS.C:1428-1432 converts before the range test:
 *
 *   ddist = cdistance(&mptr->coord, &wptr->coord);
 *   ddist *= 10000;                       <-- sectors -> raw units
 *   if (ddist < (double)MINERANGE && ...)
 *
 * MINERANGE is 10000 raw units (GEMAIN.H:195), i.e. exactly one sector. The
 * port compared the raw `cdistance` result — a value in SECTORS, typically
 * single digits — against 10000, so `dist > MINERANGE` was never true and every
 * ship in the galaxy counted as being inside the blast.
 *
 * Found in playtest: one mine deployed at (20.5, 10.5) destroyed all 20
 * Cybertrons across the entire galaxy in a single tick, every kill credited to
 * the deployer.
 *
 * @see GEFUNCS.C:1428 mine sweep  @see GEMAIN.H:195 MINERANGE
 */

import { cdistance } from '../../../src/game/combat/combat-math';
import { MINERANGE } from '../../../src/game/constants';

/** The conversion the C source applies before comparing against MINERANGE. */
function distRaw(a: { xcoord: number; ycoord: number }, b: { xcoord: number; ycoord: number }): number {
  return cdistance(a, b) * 10_000;
}

describe('mine blast radius unit handling', () => {
  const mine = { xcoord: 20.5, ycoord: 10.5 };

  it('MINERANGE is one sector expressed in raw units', () => {
    expect(MINERANGE).toBe(10_000);
    expect(MINERANGE / 10_000).toBe(1);
  });

  it('a ship in the same sector is inside the blast', () => {
    const close = { xcoord: 20.53, ycoord: 10.5 }; // 0.03 sectors = 300 raw
    expect(distRaw(mine, close)).toBeLessThan(MINERANGE);
  });

  it('a ship two sectors away is OUTSIDE the blast', () => {
    const far = { xcoord: 22.5, ycoord: 10.5 }; // 2 sectors = 20 000 raw
    expect(distRaw(mine, far)).toBeGreaterThan(MINERANGE);
  });

  it('a ship across the galaxy is far outside the blast', () => {
    const acrossGalaxy = { xcoord: 0.5, ycoord: 0.5 };
    expect(distRaw(mine, acrossGalaxy)).toBeGreaterThan(MINERANGE * 10);
  });

  it('REGRESSION: comparing un-converted sector distance puts the whole galaxy in range', () => {
    // This is the defect: cdistance alone is in sectors, so the guard
    // `dist > MINERANGE` never fires for any ship anywhere.
    const acrossGalaxy = { xcoord: 0.5, ycoord: 0.5 };
    const sectorDistance = cdistance(mine, acrossGalaxy);
    expect(sectorDistance).toBeLessThan(MINERANGE); // <-- why nothing was ever skipped
    expect(distRaw(mine, acrossGalaxy)).toBeGreaterThan(MINERANGE); // correct comparison
  });
});
