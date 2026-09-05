/**
 * T046 — abandon while destruct > 0 clears the countdown and takes precedence.
 * @see specs/013-ship-management/spec.md Edge Cases
 * @see AbandonHandlerService — destruct cleared before marking abandoned
 */
import { AbandonHandlerService } from '../../../../src/game/commands/handlers/abandon.handler';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { SHIP_STATUS_ABANDONED } from '../../../../src/game/commands/_ship-management-constants';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'USS Bailing', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(ship: ShipState) {
  const mockShipState = {
    // abandon() persists status as well as setting it — the tick flush strips
    // `status`, so the handler cannot go through mutate().
    abandon: jest.fn().mockImplementation((_uid: string, _no: number) => {
      ship.status = SHIP_STATUS_ABANDONED;
      ship.destruct = 0;
      return Promise.resolve();
    }),
  } as unknown as ShipStateService;
  return { handler: new AbandonHandlerService(mockShipState, { abandonPlanet: jest.fn().mockResolvedValue({ ok: true, name: 'Aurora' }) } as unknown as PlanetStateService) };
}

describe('abandon destruct precedence edge case', () => {
  it('abandon while destruct=15 → destruct cleared to 0, status=ABANDONED', () => {
    const ship = makeShip({ destruct: 15, status: 1 });
    const { handler } = makeService(ship);
    handler.command.handler(ship, ['ship', 'yes'], {});
    expect(ship.destruct).toBe(0);
    expect(ship.status).toBe(SHIP_STATUS_ABANDONED);
  });

  it('abandon while destruct=1 (final tick imminent) → destruct cleared before countdown expires', () => {
    const ship = makeShip({ destruct: 1, status: 1 });
    const { handler } = makeService(ship);
    handler.command.handler(ship, ['ship', 'yes'], {});
    expect(ship.destruct).toBe(0);
    expect(ship.status).toBe(SHIP_STATUS_ABANDONED);
  });

  it('abandon with destruct=0 → status still set to ABANDONED (no-destruct path also works)', () => {
    const ship = makeShip({ destruct: 0, status: 1 });
    const { handler } = makeService(ship);
    handler.command.handler(ship, ['ship', 'yes'], {});
    expect(ship.destruct).toBe(0);
    expect(ship.status).toBe(SHIP_STATUS_ABANDONED);
  });
});
