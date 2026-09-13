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
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

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
  return baseMakeShip({
    userid: userid,
    shipname: `Ship-${userid}`,
    shpclass: 5,
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 10000,
    where: 10,
    items: items,
  });
}

describe('AttackHandlerService — concurrent attack mutex', () => {
  it('second attacker gets ATT_SELF after first attacker captures the planet inside the lock', async () => {
    // Planet initially owned by 'defender'
    const planet = makePlanet('defender');
    let lockCount = 0;

    const mockShipState = {
      mutate: vi.fn().mockImplementation(
        (_uid: string, _no: number, fn: (s: ShipState) => void) => {
          const s = makeShip('attacker1');
          fn(s);
        },
      ),
    } as unknown as ShipStateService;

    // Simulate: first attacker captures planet inside lock (userid changes)
    const mockPlanetService = {
      get: vi.fn().mockImplementation(() => planet),
      withPlanetLock: vi.fn().mockImplementation(
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
      flushPlanet: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanetStateService;

    const mockAttackService = {
      attackTroop: vi.fn().mockResolvedValue({
        left1: 300, left2: 0, kill1: 50, kill2: 100, won: 1,
        itemsDestroyed: [], narration: ['attacker won.'],
      }),
      attackFighter: vi.fn().mockResolvedValue({}),
    } as unknown as PlanetAttackService;

    const mockShipClassCache = {
      get: vi.fn().mockReturnValue({ canAttackPlanet: true }),
    } as unknown as ShipClassCacheService;

    const handler1 = new AttackHandlerService(
      mockShipState, mockPlanetService, mockAttackService, mockShipClassCache, FIRETICKS_DEFAULT,
    );
    const handler2 = new AttackHandlerService(
      { mutate: vi.fn() } as unknown as ShipStateService,
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
      mutate: vi.fn(),
    } as unknown as ShipStateService;

    const mockPlanetService = {
      get: vi.fn().mockReturnValue(planet),
      withPlanetLock: vi.fn().mockImplementation(
        async (_x: number, _y: number, _p: number, fn: () => Promise<unknown>) => fn(),
      ),
      flushPlanet: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanetStateService;

    const mockAttackService = {
      attackTroop: vi.fn(),
      attackFighter: vi.fn(),
    } as unknown as PlanetAttackService;

    const mockShipClassCache = {
      get: vi.fn().mockReturnValue({ canAttackPlanet: true }),
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
