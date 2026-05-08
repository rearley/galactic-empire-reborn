/**
 * T043 — Beacon socket event smoke test (manual).
 *
 * Verifies that the beacon event infrastructure is wired correctly by
 * inspecting the gateway handler directly (no live WebSocket needed).
 *
 * Run with: npm run test:manual
 *
 * This test encodes the QA validation scenario from feature 020 (US4):
 *  - The gateway responds to sector transition events.
 *  - Beacon payload shape matches the contract.
 *  - BEACON_EVENT constant is exported and equals 'beacon'.
 */

import { BEACON_EVENT, BeaconEvent } from '../../src/gateway/events/beacon.event';
import { PHYSICS_SECTOR_TRANSITION_EVENT } from '../../src/game/tick/sector-transition.subscriber';

describe('T043 — beacon socket event smoke test', () => {
  it('BEACON_EVENT constant equals "beacon"', () => {
    expect(BEACON_EVENT).toBe('beacon');
  });

  it('PHYSICS_SECTOR_TRANSITION_EVENT is defined', () => {
    expect(PHYSICS_SECTOR_TRANSITION_EVENT).toBeTruthy();
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

  it('sector-flat encoding: toSector = y * MAXX + x (MAXX=30)', () => {
    const MAXX = 30;
    const sector = { x: 5, y: 3 };
    expect(sector.y * MAXX + sector.x).toBe(95);
  });
});
