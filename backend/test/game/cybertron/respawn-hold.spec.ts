/**
 * PORT-ORIGINAL: a killed hull's class stays empty for a while, and the rarer
 * canon makes that hull, the longer it stays empty.
 *
 * The pure arithmetic lives in respawn-delay.spec.ts. This file pins the part
 * that made it necessary — that the spawn slot actually REFUSES to refill a
 * class whose hull has just died, and stops refusing once the delay is up.
 *
 * @see docs/DECISIONS.md 2026-09-20 — rarity re-expressed as time
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CYBERTRON_CLASS_DEFAULTS } from '../../../src/game/cybertron/cybertron.config';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import { COMBAT_SHIP_DESTROYED } from '../../../src/game/combat/combat-events';
import { CANON_TOT_TO_CREATE, respawnDelayMs } from '../../../src/game/cybertron/cyb-population';

async function buildHarness(seed = 1) {
  const rand = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  const shipMap = new Map<string, ShipState>();
  const shipStateService = {
    findAllShips: () => Array.from(shipMap.values()),
    findByUserid: (uid: string) => Array.from(shipMap.values()).filter((s) => s.userid === uid),
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: (s: { userid: string; shipno: number }) => shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
  } as unknown as ShipStateService;

  const classCache = new Map<number, ReturnType<ShipClassCacheService['get']>>();
  const shipClassCache = {
    get: (n: number) => classCache.get(n),
    // Canon dispatches AI behaviour by CLASS (GEMAIN.C:878-895); a droid never
    // runs cyb_lives. These harnesses only ever hold CYBORG classes.
    getCategory: (n: number) => (classCache.has(n) ? 'CPU_COMBATIVE' : undefined),
    getMaxPhaser: (n: number) => { const e = classCache.get(n); if (!e) throw new Error(`Class ${n} not found`); return e.maxPhaser; },
    getMaxTons: (n: number) => { const e = classCache.get(n); if (!e) throw new Error(`Class ${n} not found`); return e.maxTons; },
    setClass: (n: number, e: ReturnType<ShipClassCacheService['get']>) => classCache.set(n, e),
  } as unknown as ShipClassCacheService & { setClass: (n: number, e: unknown) => void };

  const createdSpawns: Array<{ classNumber: number; userid: string; shipno: number; topspeed: number }> = [];
  const repository = {
    hydrateAll: vi.fn().mockResolvedValue(undefined),
    createSpawn: vi.fn().mockImplementation(async (slot: { userid: string; shipno: number; classNumber: number; tick: number; topspeed: number }) => {
      createdSpawns.push({
        classNumber: slot.classNumber, userid: slot.userid, shipno: slot.shipno, topspeed: slot.topspeed,
      });
      const ship: ShipState = baseMakeShip({
    userid: slot.userid,
    shipno: slot.shipno,
    shipname: `Cybrg-${slot.shipno}`,
    shpclass: slot.classNumber,
    status: 2,
    tick: slot.tick,
    xcoord: 5,
    ycoord: 5,
    energy: 50000,
    phasr: 100,
    phasrtype: 1,
    lastfired: 255,
    shieldtype: 1,
    shieldstat: 1,
    shield: 1,
    helm: 1,
    decout: [0, 0, 0, 0, 0],
    freq: [],
    items: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
    cybmine: 255,
    cybskill: 10,
    cybupdate: 50,
    topspeed: 8,
  });
      shipMap.set(`${slot.userid}:${slot.shipno}`, ship);
    }),
    flushShipsImmediate: vi.fn().mockResolvedValue(undefined),
    flushUsersImmediate: vi.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => n > 2_000_000n ? 2_000_000n : n,
  } as unknown as CybertronRepository;

  const subscribed: Array<(ctx: unknown) => void> = [];
  const tickService = {
    subscribe: (_kind: unknown, fn: (ctx: unknown) => void) => {
      subscribed.push(fn);
      return () => {};
    },
  } as unknown as TickService;

  const svc = new CybertronTickService(
    tickService, shipStateService, shipClassCache, repository, events, rand,
  );
  // Disable boot seeding — this file tests the tick-based spawn cadence only
  process.env.CYBERTRON_BOOT_SEED = 'false';
  await svc.onModuleInit();

  // Register all AI classes 21-25
  for (const [classNumStr] of Object.entries(CYBERTRON_CLASS_DEFAULTS)) {
    const n = Number(classNumStr);
    (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(n, {
      maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
      scanRange: 50_000, maxTons: 900, hasTorpedo: true, hasMissile: false,
      hasJammer: true, hasMine: true, hasZipper: false, noClaim: 3, tough: 0, cybLowestClassAttacks: 1,
    });
  }

  async function fireTick(n = 1): Promise<void> {
    for (let i = 0; i < n; i++) {
      for (const fn of subscribed) {
        fn({ kind: 'PHYSICS', tickNumber: i + 1, firedAt: new Date() });
      }
      await new Promise((r) => setImmediate(r));
    }
  }

  return { shipMap, createdSpawns, fireTick, classCache, events };
}

const OBLITERATOR = 25;

function killOf(classNumber: number) {
  return {
    victimId: 'Cybrg-999', victimShipKey: 'Cybrg-999:999', victimUserid: 'Cybrg-999',
    attackerId: 'rick', attackerShipKey: 'rick:1', attackerUserid: 'rick',
    attackerChannel: 1, cause: 'phasor', sector: { x: 0, y: 0 }, tickAt: new Date(),
    loot: [], victimClass: classNumber, scoreAwarded: 0,
  };
}

describe('a killed class is not refilled until its delay is up', () => {
  // Date ONLY: the harness awaits setImmediate between ticks, and faking that
  // deadlocks the loop it is driving.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('refuses to respawn an Obliterator immediately after one dies', async () => {
    const { createdSpawns, fireTick, events } = await buildHarness(1);

    events.emit(COMBAT_SHIP_DESTROYED, killOf(OBLITERATOR));

    // Well past the 30-tick spawn slot, but inside the Obliterator's delay.
    vi.setSystemTime(Date.now() + 60_000);
    await fireTick(120);

    expect(createdSpawns.filter((s) => s.classNumber === OBLITERATOR)).toHaveLength(0);
  });

  it('respawns it once the delay has elapsed', async () => {
    const { createdSpawns, fireTick, events } = await buildHarness(1);

    events.emit(COMBAT_SHIP_DESTROYED, killOf(OBLITERATOR));

    vi.setSystemTime(Date.now() + respawnDelayMs(CANON_TOT_TO_CREATE[OBLITERATOR]) + 1000);
    await fireTick(300);

    expect(createdSpawns.filter((s) => s.classNumber === OBLITERATOR).length).toBeGreaterThan(0);
  });

  it('holds no grudge against a class nothing has killed', async () => {
    // The delay is armed by a DEATH. A galaxy that has simply never been full
    // — a fresh database, a raised tot_to_create — must fill at the old pace.
    const { createdSpawns, fireTick } = await buildHarness(1);

    await fireTick(120);

    expect(createdSpawns.length).toBeGreaterThan(0);
  });

  it('ignores the death of a ship that is not a Cybertron', async () => {
    const { createdSpawns, fireTick, events } = await buildHarness(1);

    events.emit(COMBAT_SHIP_DESTROYED, {
      ...killOf(OBLITERATOR), victimUserid: 'rick', victimId: 'rick', victimShipKey: 'rick:1',
    });

    vi.setSystemTime(Date.now() + 60_000);
    await fireTick(300);

    // A player dying in an Obliterator-class hull is impossible, but the guard
    // is on the userid rather than the class, so this pins that it is.
    expect(createdSpawns.filter((s) => s.classNumber === OBLITERATOR).length).toBeGreaterThan(0);
  });
});
