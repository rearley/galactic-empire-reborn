/**
 * Cargo transfer on kill — GEFUNCS.C:killem (1122-1136).
 * When a ship is destroyed, a random fraction of each item (except men and
 * troops) is transferred to the attacker, subject to a cargo-weight check.
 *
 * @see GEFUNCS.C:killem — lines 1122-1136
 * @see specs/006b-combat/tasks.md
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Random } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';
import { I_MEN, I_TROOPS, NUMITEMS } from '../../../src/game/constants/items';

function makeRandom(values: number[]): Random {
  let i = 0;
  return { next: () => values[i++ % values.length] };
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    // A ship in the game holds a unique `channel` (this port's usrnum) and
    // attribution reads it, not `shipno`. These fixtures stage firer and victim
    // by giving each a distinct shipno, so mirror it into channel.
    channel: over.channel ?? over.shipno ?? 1,
  };
}

async function makeHarness(ships: ShipState[], random: Random, maxTons = 5000) {
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
    registerSnapshotProvider: jest.fn(),
  } as unknown as import('../../../src/game/tick/tick.service').TickService;

  const mineRepo = {
    findAllActive: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    delete: jest.fn(),
  } as unknown as MineRepository;

  const mineRegistry = new MineRegistry();
  const events = new EventEmitter2();
  const logger = new Logger('CargoTransferSpec');
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100000, maxTons,
  } as never);

  const service = new CombatTickService(
    tickService, shipState, mineRepo, mineRegistry,
    random, events, logger, classCache,
  );
  await service.onModuleInit();

  return {
    service, shipMap, events, shipState,
    fire: () => {
      const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
      for (const h of subscribers) h(ctx);
    },
  };
}

describe('CombatTickService — cargo transfer on kill (GEFUNCS.C:killem 1122-1136)', () => {
  it('transfers full item amounts when attacker has ample cargo capacity', async () => {
    // Divisor = 1 (next()=0.0 → floor(0*5)+1=1), so full amounts transfer.
    const attacker = makeShip({ userid: 'a', shipno: 7, items: Array(NUMITEMS).fill(0n) as bigint[] });
    const victim = makeShip({
      userid: 'v', shipno: 2,
      damage: 100,
      lastfired: 7,
      items: (() => {
        const items = Array(NUMITEMS).fill(0n) as bigint[];
        items[1] = 100n;  // 100 missiles × 5 tons = 500 tons
        items[2] = 50n;   // 50 torps × 3 tons = 150 tons
        items[12] = 200n; // 200 gold × 0.5 tons = 100 tons
        return items;
      })(),
    });

    // All calls return 0.0 → divisor=1 → transfer full amounts.
    const h = await makeHarness([attacker, victim], makeRandom([0.0]));
    const events: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => events.push(e));

    h.fire();

    expect(attacker.items[1]).toBe(100n);
    expect(attacker.items[2]).toBe(50n);
    expect(attacker.items[12]).toBe(200n);
  });

  it('skips missiles when attacker is near capacity but transfers lighter items that fit', async () => {
    // Attacker has 96 tons used (96 men × 1 ton), maxTons=100 → 4 tons available.
    // Divisor = 5 (next()=0.8 → floor(4)+1=5).
    // Victim has 5 missiles (5/5=1 missile = 5 tons — does NOT fit in 4 tons)
    //        and 5 spies  (5/5=1 spy   = 1 ton  — DOES fit in 4 tons).
    const attackerItems = Array(NUMITEMS).fill(0n) as bigint[];
    attackerItems[I_MEN] = 96n; // 96 tons already used
    const attacker = makeShip({ userid: 'a', shipno: 7, items: attackerItems });

    const victimItems = Array(NUMITEMS).fill(0n) as bigint[];
    victimItems[1] = 5n;  // missiles, 5 tons each
    victimItems[13] = 5n; // spies, 1 ton each
    const victim = makeShip({
      userid: 'v', shipno: 2,
      damage: 100, lastfired: 7,
      items: victimItems,
    });

    // Return 0.8 → divisor=5 for every item draw.
    const h = await makeHarness([attacker, victim], makeRandom([0.8]), 100);
    h.events.on(COMBAT_SHIP_DESTROYED, () => {});

    h.fire();

    // Missiles (5 tons each, 1 unit = 5 tons > 4 available) — should NOT transfer.
    expect(attacker.items[1]).toBe(0n);
    // Spies (1 ton each, 1 unit = 1 ton ≤ 4 available) — should transfer.
    expect(attacker.items[13]).toBe(1n);
  });

  it('transfers nothing when attacker cargo is completely full', async () => {
    // Attacker has exactly maxTons used (100 men = 100 tons), maxTons=100.
    const attackerItems = Array(NUMITEMS).fill(0n) as bigint[];
    attackerItems[I_MEN] = 100n;
    const attacker = makeShip({ userid: 'a', shipno: 7, items: attackerItems });

    const victimItems = Array(NUMITEMS).fill(0n) as bigint[];
    victimItems[1] = 10n; // missiles
    const victim = makeShip({
      userid: 'v', shipno: 2,
      damage: 100, lastfired: 7,
      items: victimItems,
    });

    // Divisor=1 (maximum transfer attempt — still blocked by full cargo).
    const h = await makeHarness([attacker, victim], makeRandom([0.0]), 100);
    h.events.on(COMBAT_SHIP_DESTROYED, () => {});

    h.fire();

    expect(attacker.items[1]).toBe(0n);
  });

  it('never transfers men (index 0) or troops (index 8) even when victim has them', async () => {
    const attacker = makeShip({ userid: 'a', shipno: 7, items: Array(NUMITEMS).fill(0n) as bigint[] });

    const victimItems = Array(NUMITEMS).fill(0n) as bigint[];
    victimItems[I_MEN] = 1000n;    // men — must never transfer
    victimItems[I_TROOPS] = 200n;  // troops — must never transfer
    const victim = makeShip({
      userid: 'v', shipno: 2,
      damage: 100, lastfired: 7,
      items: victimItems,
    });

    const h = await makeHarness([attacker, victim], makeRandom([0.0]));
    h.events.on(COMBAT_SHIP_DESTROYED, () => {});

    h.fire();

    expect(attacker.items[I_MEN]).toBe(0n);
    expect(attacker.items[I_TROOPS]).toBe(0n);
  });

  it('includes transferred items in COMBAT_SHIP_DESTROYED event loot field', async () => {
    // Divisor=1 → transfer full amounts.
    const attacker = makeShip({ userid: 'a', shipno: 7, items: Array(NUMITEMS).fill(0n) as bigint[] });

    const victimItems = Array(NUMITEMS).fill(0n) as bigint[];
    victimItems[1] = 60n;  // missiles
    victimItems[2] = 30n;  // torps
    const victim = makeShip({
      userid: 'v', shipno: 2,
      damage: 100, lastfired: 7,
      items: victimItems,
    });

    const h = await makeHarness([attacker, victim], makeRandom([0.0]));
    const destroyed: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyed.push(e));

    h.fire();

    expect(destroyed).toHaveLength(1);
    const loot = destroyed[0].loot;
    expect(loot).toBeDefined();

    const missileLoot = loot.find((l) => l.itemIndex === 1);
    expect(missileLoot?.amount).toBe(60n);

    const torpLoot = loot.find((l) => l.itemIndex === 2);
    expect(torpLoot?.amount).toBe(30n);

    // No men or troops in loot.
    expect(loot.some((l) => l.itemIndex === I_MEN)).toBe(false);
    expect(loot.some((l) => l.itemIndex === I_TROOPS)).toBe(false);
  });

  it('emits empty loot array when there is no attacker', async () => {
    // No attacker ship — lastfired=255 matches no one.
    const victim = makeShip({
      userid: 'v', shipno: 2,
      damage: 100, lastfired: 255,
      items: (() => {
        const items = Array(NUMITEMS).fill(0n) as bigint[];
        items[1] = 50n;
        return items;
      })(),
    });

    const h = await makeHarness([victim], makeRandom([0.0]));
    const destroyed: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyed.push(e));

    h.fire();

    expect(destroyed).toHaveLength(1);
    expect(destroyed[0].loot).toEqual([]);
  });
});
