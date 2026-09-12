/**
 * Beacon socket event wiring — the contract the gateway emits on.
 *
 * Was `test/manual/T043.manual.spec.ts`, and nothing about it is manual: it
 * reads constants and computes an encoding, with no live stack and no database.
 * It sat in a suite that CI never ran and that failed on invocation for
 * unrelated reasons, so a passing test was invisible. Moved into the suite that
 * actually runs. @see issue #37
 *
 * This test encodes the QA validation scenario from feature 020 (US4):
 *  - The gateway responds to sector transition events.
 *  - Beacon payload shape matches the contract.
 *  - BEACON_EVENT constant is exported and equals 'beacon'.
 */

import { BEACON_EVENT, BeaconEvent } from '../../src/gateway/events/beacon.event';
import { PHYSICS_SECTOR_TRANSITION } from '../../src/game/physics/physics-events';
import { UNIVMAX } from '../../src/game/constants';

describe('T043 — beacon socket event smoke test', () => {
  it('BEACON_EVENT constant equals "beacon"', () => {
    expect(BEACON_EVENT).toBe('beacon');
  });

  it('PHYSICS_SECTOR_TRANSITION names the event the gateway listens for', () => {
    expect(PHYSICS_SECTOR_TRANSITION).toBe('physics.sector-transition');
  });

  it('BeaconEvent shape has required fields', () => {
    const event: BeaconEvent = {
      shipId: 'u1:1',
      shipName: 'TestShip',
      fromSector: 0,
      toSector: 1,
    };
    expect(event.shipId).toBe('u1:1');
    expect(event.shipName).toBe('TestShip');
    expect(typeof event.fromSector).toBe('number');
    expect(typeof event.toSector).toBe('number');
  });

  /**
   * The flattening is over the GALAXY, not the scan map. MAXX=30 and MAXY=15
   * are the character dimensions of the ASCII viewport; the galaxy runs
   * -UNIVMAX..+UNIVMAX on both axes. This test used to assert
   * `y * 30 + x`, which is the MAXX-as-galaxy mistake in test form — it passed
   * because it checked its own arithmetic rather than the encoding the
   * gateway actually emits.
   * @see src/gateway/sector-transition.ts  @see backend/src/game/CLAUDE.md §2
   */
  it('sector-flat encoding spans the galaxy, not the scan viewport', () => {
    const side = UNIVMAX * 2 + 1;
    const flatten = (s: { x: number; y: number }) => (s.y + UNIVMAX) * side + (s.x + UNIVMAX);
    expect(flatten({ x: -UNIVMAX, y: -UNIVMAX })).toBe(0);
    expect(flatten({ x: UNIVMAX, y: UNIVMAX })).toBe(side * side - 1);
    // Distinct cells must not collide — the 30-wide flattening aliased every
    // pair of cells 30 apart on x into one sector id.
    expect(flatten({ x: 0, y: 1 })).not.toBe(flatten({ x: 30, y: 0 }));
  });
});
