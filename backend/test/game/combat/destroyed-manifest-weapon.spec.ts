/**
 * The destruction manifest must name the weapon that landed the killing blow.
 *
 * `ShipDestroyedService` prints `cause=${event.weapon ?? 'unknown'}`
 * (ship-destroyed.service.ts:366) against a union that already lists every
 * weapon in the game. But the kill path set it in exactly one place —
 *
 *   weapon: victim.deathCause?.kind === 'gravity' ? 'gravity' : null
 *
 * — so it resolved to 'gravity' or null, and null prints as `unknown`. Every
 * one of the fourteen manifests in production on 2026-09-17 said
 * `cause=unknown`, including a Cyberquad killed by a player with torpedoes.
 *
 * The information was never missing: every COMBAT_HIT already carries an
 * accurate weapon. It was discarded between the hit landing and the death
 * resolving. `lastWeapon` is stamped at the same sites as `lastfired`, and is
 * deliberately NOT folded into `lastfiredBy` — a mine whose owner has left the
 * game records no name, and conflating the two would lose `cause=mine` along
 * with the attacker.
 *
 * @see https://github.com/rearley/galactic-empire-reborn/issues/52
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'T',
    energy: 50000,
    topspeed: 10,
    channel: over.channel ?? over.shipno ?? 1,
    ...over,
  });
}

async function makeHarness(ships: ShipState[], seed = 99) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
    removeFromGame: (ship: { userid: string; shipno: number }) => {
      shipMap.delete(shipKey(ship.userid, ship.shipno));
    },
  } as unknown as import('../../../src/game/ship/ship-state.service').ShipStateService;

  const subscribers: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_kind: TickKind, h: (c: TickContext) => void) => {
      subscribers.push(h);
      return () => {};
    },
    registerSnapshotProvider: vi.fn(),
  } as unknown as import('../../../src/game/tick/tick.service').TickService;

  const mineRepo = {
    findAllActive: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    delete: vi.fn(),
  } as unknown as MineRepository;

  const events = new EventEmitter2();
  const logger = new Logger('DestroyedManifestWeaponSpec');
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100000, maxTons: 5000,
  } as never);

  const service = new CombatTickService(
    tickService, shipState, mineRepo, new MineRegistry(),
    new Mulberry32Adapter(seed), events, logger, classCache,
  );
  await service.onModuleInit();

  const destroyed: CombatShipDestroyedEvent[] = [];
  events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyed.push(e));

  return {
    destroyed,
    fire: () => {
      const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
      for (const h of subscribers) h(ctx);
    },
  };
}

/** A victim one hit from death, with an inbound projectile already resolved. */
function victimAt95(over: Partial<ShipState>): ShipState {
  return makeShip({
    userid: 'v', shipno: 2, xcoord: 0, ycoord: 0,
    shield: 0, shieldstat: 0, damage: 95,
    ...over,
  });
}

describe('the destruction manifest names the weapon', () => {
  it('a torpedo kill reports cause=torpedo', async () => {
    const firer = makeShip({ userid: 'a', shipno: 7, xcoord: 0, ycoord: 0 });
    const victim = victimAt95({
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [10, 0, 0],
    });
    const h = await makeHarness([firer, victim]);
    h.fire();

    expect(h.destroyed).toHaveLength(1);
    expect(h.destroyed[0].weapon).toBe('torpedo');
  });

  it('a missile kill reports cause=missile', async () => {
    const firer = makeShip({ userid: 'c', shipno: 9, xcoord: 0, ycoord: 0 });
    const victim = victimAt95({
      lmisslChannel: [9, 255, 255],
      lmisslDistance: [10, 0, 0],
      lmisslEnergy: [50000, 0, 0],
    });
    const h = await makeHarness([firer, victim]);
    h.fire();

    expect(h.destroyed).toHaveLength(1);
    expect(h.destroyed[0].weapon).toBe('missile');
  });

  it('gravity still wins over any weapon stamped earlier', async () => {
    // A ship grazed by a torpedo that did NOT kill it, then flown into a
    // planet, is killed by the planet. `deathCause` is the more specific fact
    // and must not be displaced by the last weapon to touch the hull.
    const victim = victimAt95({
      damage: 101,
      lastWeapon: 'torpedo',
      deathCause: { kind: 'gravity', what: 'planet 4' },
    });
    const h = await makeHarness([victim]);
    h.fire();

    expect(h.destroyed).toHaveLength(1);
    expect(h.destroyed[0].weapon).toBe('gravity');
  });

  it('a death with no recorded weapon still reports null, not a stale one', async () => {
    const victim = victimAt95({ damage: 101 });
    const h = await makeHarness([victim]);
    h.fire();

    expect(h.destroyed).toHaveLength(1);
    expect(h.destroyed[0].weapon).toBeNull();
  });
});
