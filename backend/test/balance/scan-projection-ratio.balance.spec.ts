/**
 * `sca lo` must reveal roughly the same FRACTION of the galaxy that canon did.
 *
 * C projects the long-range overview at `scanrange * 10` (GECMDS.C:2668). That
 * multiplier is meaningless on its own — what a pilot experiences is how much
 * of the WORLD the overview covers, and that depends on UNIVMAX too. Canon
 * shipped UNIVMAX 300; we deploy 100 (docs/DECISIONS.md), so keeping the literal
 * 10 would hand a starter Interceptor a 100-sector radius inside a 201-sector
 * galaxy — the whole thing, from the hub.
 *
 * This test pins the RATIO rather than either number, so the two cannot drift
 * apart silently: change UNIVMAX and this fails until the multiplier follows.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCAN_LO_PROJECTION_MULTIPLIER } from '../../src/game/constants';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

/**
 * The DEPLOYED UNIVMAX, not the runtime one: the suite shrinks the galaxy for
 * speed (test/helpers/test-galaxy-size.ts), and this ratio is a property of the
 * world we actually ship.
 */
function deployedUnivmax(): number {
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, '../../config/game.config.json'), 'utf8'),
  ) as Record<string, unknown>;
  for (const section of Object.values(raw)) {
    if (section && typeof section === 'object' && 'UNIVMAX' in section) {
      return (section as Record<string, number>).UNIVMAX;
    }
  }
  throw new Error('UNIVMAX not found in config/game.config.json');
}

const UNIVMAX = deployedUnivmax();

/** Canon: multiplier 10 against a universe half-width of 300 sectors. */
const CANON_FRACTION = 10 / 300;

describe('sca lo projection ratio', () => {
  it('covers a canon-like fraction of the galaxy', () => {
    const ours = SCAN_LO_PROJECTION_MULTIPLIER / UNIVMAX;
    // Within 25% of canon's fraction — close enough that the overview feels the
    // same, loose enough not to forbid sensible UNIVMAX choices.
    expect(ours).toBeGreaterThan(CANON_FRACTION * 0.75);
    expect(ours).toBeLessThan(CANON_FRACTION * 1.25);
  });

  it('never lets a starter Interceptor overview the whole galaxy', () => {
    // The property the deviation exists to protect.
    const interceptor = SHIP_CLASSES.find((c) => c.classNumber === 1)!;
    const radiusSectors = (interceptor.scanRange * SCAN_LO_PROJECTION_MULTIPLIER) / 10_000;
    expect(radiusSectors).toBeLessThan(UNIVMAX);
  });

  it('still reaches well beyond the tactical scan', () => {
    // It is a LONG-range overview; collapsing it to the detection range would
    // make the mode pointless.
    expect(SCAN_LO_PROJECTION_MULTIPLIER).toBeGreaterThan(1);
  });
});
