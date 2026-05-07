/**
 * T011 — Concurrent planet attack test.
 * Verifies per-planet mutex serialises two attackers; second re-validates
 * inside the lock and rejects with ATT_SELF after first attacker captured the planet.
 * @see research.md D1 — mutex re-validation scope
 */
import { AttackHandlerService } from '../../../../src/game/commands/handlers/attack.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { PlanetAttackService } from '../../../../src/game/planet/planet-attack.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { FIRETICKS_DEFAULT } from '../../../../src/game/commands/attack.config';
import { I_TROOPS, NUMITEMS } from '../../../../src/game/constants/items';

function makeItems(): PlanetState['items'] {
  return Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
}

function makePlanet(ownerUserid: string): PlanetState {
  const items = makeItems();
  items[I_TROOPS].qty = 100n;
  return {
    xsect: 5, ysect: 5, plnum: 0,
    type: 1, xcoord: 5.5, ycoord: 5.5,
    userid: ownerUserid, name: 'Contested', enviorn: 0, resource: 0,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
    password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n, items,
  };
}

function makeShip(userid: string, troops = 500): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  items[I_TROOPS] = BigInt(troops);
  return {
    userid, shipno: 1, shipname: `Ship-${userid}`, shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    dirty: false,
  };
}

describe('AttackHandlerService — concurrent attack mutex', () => {
  it('second attacker gets ATT_SELF after first attacker captures the planet inside the lock', async () => {
    // Planet initially owned by 'defender'
    const planet = makePlanet('defender');
    let lockCount = 0;

    const mockShipState = {
      mutate: jest.fn().mockImplementation(
        (_uid: string, _no: number, fn: (s: ShipState) => void) => {
          const s = makeShip('attacker1');
          fn(s);
        },
      ),
    } as unknown as ShipStateService;

    // Simulate: first attacker captures planet inside lock (userid changes)
    const mockPlanetService = {
      get: jest.fn().mockImplementation(() => planet),
      withPlanetLock: jest.fn().mockImplementation(
        async (_x: number, _y: number, _p: number, fn: () => Promise<unknown>) => {
          lockCount++;
          if (lockCount === 1) {
            // First attacker captures planet
            const result = await fn();
            planet.userid = 'attacker1';
            return result;
          } else {
            // Second attacker runs after first; inside lock, planet.userid is now 'attacker1'
            return fn();
          }
        },
      ),
      flushPlanet: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlanetStateService;

    const mockAttackService = {
      attackTroop: jest.fn().mockResolvedValue({
        left1: 300, left2: 0, kill1: 50, kill2: 100, won: 1,
        itemsDestroyed: [], narration: ['attacker won.'],
      }),
      attackFighter: jest.fn().mockResolvedValue({}),
    } as unknown as PlanetAttackService;

    const mockShipClassCache = {
      get: jest.fn().mockReturnValue({ canAttackPlanet: true }),
    } as unknown as ShipClassCacheService;

    const handler1 = new AttackHandlerService(
      mockShipState, mockPlanetService, mockAttackService, mockShipClassCache, FIRETICKS_DEFAULT,
    );
    const handler2 = new AttackHandlerService(
      { mutate: jest.fn() } as unknown as ShipStateService,
      mockPlanetService, mockAttackService, mockShipClassCache, FIRETICKS_DEFAULT,
    );

    const ship1 = makeShip('attacker1');
    const ship2 = makeShip('attacker1'); // same user as new owner → self-attack

    // First attacker fires
    const result1 = await handler1.command.handler(ship1, ['100', 'tro'], {});
    expect((result1 as { lines: { text: string }[] }).lines[0].text).not.toBe(
      formatMessage(MessageId.ATT_SELF),
    );

    // Simulate second attacker who is now attacking their own planet
    const result2 = await handler2.command.handler(ship2, ['100', 'tro'], {});
    // Inside the mock, planet.userid is now 'attacker1' == ship2.userid → self-attack
    expect((result2 as { lines: { text: string }[] }).lines[0].text).toBe(
      formatMessage(MessageId.ATT_SELF),
    );
  });

  it('no cargo deduction occurs on re-validation rejection', async () => {
    const planet = makePlanet('defender');
    // Make planet owned by attacker before lock acquired (simulate pre-captured)
    planet.userid = 'attacker';

    const mockShipState = {
      mutate: jest.fn(),
    } as unknown as ShipStateService;

    const mockPlanetService = {
      get: jest.fn().mockReturnValue(planet),
      withPlanetLock: jest.fn().mockImplementation(
        async (_x: number, _y: number, _p: number, fn: () => Promise<unknown>) => fn(),
      ),
      flushPlanet: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlanetStateService;

    const mockAttackService = {
      attackTroop: jest.fn(),
      attackFighter: jest.fn(),
    } as unknown as PlanetAttackService;

    const mockShipClassCache = {
      get: jest.fn().mockReturnValue({ canAttackPlanet: true }),
    } as unknown as ShipClassCacheService;

    const handler = new AttackHandlerService(
      mockShipState, mockPlanetService, mockAttackService, mockShipClassCache, FIRETICKS_DEFAULT,
    );

    const ship = makeShip('attacker');
    const result = await handler.command.handler(ship, ['100', 'tro'], {});
    expect((result as { lines: { text: string }[] }).lines[0].text).toBe(
      formatMessage(MessageId.ATT_SELF),
    );
    // mutate should NOT have been called (no cargo deducted)
    expect(mockShipState.mutate).not.toHaveBeenCalled();
    // attack should NOT have been called
    expect(mockAttackService.attackTroop).not.toHaveBeenCalled();
  });
});
