/**
 * The Cybertron tick writes its decisions to the trace a sysop reads with
 * `sys trace`. Replays the production case the trace exists for: an Obliterator
 * holding a claim on a pilot who has flown into the neutral zone.
 * @see issue #60, src/game/cybertron/cyb-trace.service.ts
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { CybTraceService } from '../../../src/game/cybertron/cyb-trace.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> & { userid: string; shipno: number; shpclass: number }): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5,
    ycoord: 5,
    energy: 50000,
    phasr: 100,
    phasrtype: 2,
    lastfired: 255,
    shieldtype: 2,
    shieldstat: 1,
    shield: 2,
    helm: 1,
    decout: [0, 0, 0, 0, 0],
    freq: [],
    items: [0n, 0n, 0n, 0n, 0n, 0n, 10n, 10n, 0n, 0n, 0n, 10n, 0n, 5n, 0n, 0n],
    cybmine: 255,
    cybskill: 10,
    cybupdate: 50,
    tick: 1,
    topspeed: 8,
    ...overrides,
  });
}

async function buildHarness(seed = 42) {
  const trace = new CybTraceService({ now: () => 1_000_000 });
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
    // Canon dispatches AI behaviour by CLASS; a droid never
    // runs cyb_lives. These harnesses only ever hold CYBORG classes.
    getCategory: (n: number) => (classCache.has(n) ? 'CPU_COMBATIVE' : undefined),
    getMaxPhaser: (n: number) => { const e = classCache.get(n); if (!e) throw new Error(`Class ${n} not found`); return e.maxPhaser; },
    getMaxTons: (n: number) => { const e = classCache.get(n); if (!e) throw new Error(`Class ${n} not found`); return e.maxTons; },
    setClass: (n: number, e: ReturnType<ShipClassCacheService['get']>) => classCache.set(n, e),
  } as unknown as ShipClassCacheService & { setClass: (n: number, e: unknown) => void };

  const repository = {
    hydrateAll: vi.fn().mockResolvedValue(undefined),
    createSpawn: vi.fn().mockResolvedValue(undefined),
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
    tickService,
    shipStateService,
    shipClassCache,
    repository,
    events,
    rand,
    undefined,
    undefined,
    undefined,
    undefined,
    trace,
  );
  await svc.onModuleInit();

  function fireTick(n = 1): void {
    for (let i = 0; i < n; i++) {
      for (const fn of subscribed) {
        fn({ kind: 'PHYSICS', tickNumber: i + 1, firedAt: new Date() });
      }
    }
  }

  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(21, {
    maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
    scanRange: 500_000, // very large to ensure the player is always "in range"
    maxTons: 900, hasTorpedo: true, hasMissile: false,
    hasJammer: true, hasMine: true, hasZipper: true, noClaim: 3, tough: 0, cybLowestClassAttacks: 1,
  });
  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(3, {
    maxAcceleration: 1000, maxWarp: 5, maxPhaser: 1, maxShields: 1,
    scanRange: 30_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, noClaim: 3, tough: 0, cybLowestClassAttacks: 0,
  });

  return { trace, svc, shipStateService, shipClassCache, repository, events, shipMap, fireTick };
}


const KEY = 'Cybrg-205:205';

async function settle(fireTick: (n?: number) => void, n = 1): Promise<void> {
  fireTick(n);
  await new Promise((r) => setImmediate(r));
}

describe('the Cybertron tick writes its trace', () => {
  it('tells the hub story in one read: claim released for the zone, then nobody to hunt', async () => {
    const { trace, shipMap, fireTick } = await buildHarness(7);
    shipMap.set(KEY, makeShip({
      userid: 'Cybrg-205', shipno: 205, shpclass: 21, status: 2,
      xcoord: 0.54, ycoord: 0.29, cybmine: 18, tick: 1, cybupdate: 100,
      holdcourse: 0, speed2b: 284, head2b: 17,
    }));
    shipMap.set('player5:5', makeShip({
      userid: 'player5', shipno: 5, shpclass: 3, status: 1,
      xcoord: 0.5, ycoord: 0.5, channel: 18, username: 'Wasp',
    }));

    await settle(fireTick);

    const entries = trace.read(KEY);
    expect(entries.map((e) => e.event)).toEqual(['releaseZoneEntry', 'scan']);
    expect(entries[0]).toMatchObject({ act: 1 });
    expect(entries[0].changes.map((c) => c.field)).toEqual(['cybmine', 'speed2b', 'head2b']);
    expect(entries[0].changes[0]).toEqual({ field: 'cybmine', from: 18, to: 255 });
    expect(entries[1].detail).toBe('1 pilot: 1 in zone → no target');
  });

  it('names the pilot a scan picks, and logs the band it steers on', async () => {
    const { trace, shipMap, fireTick } = await buildHarness(7);
    shipMap.set(KEY, makeShip({
      userid: 'Cybrg-205', shipno: 205, shpclass: 21, status: 2,
      xcoord: 5, ycoord: 5, cybmine: 255, tick: 1, cybupdate: 100, holdcourse: 0,
    }));
    shipMap.set('player5:5', makeShip({
      userid: 'player5', shipno: 5, shpclass: 3, status: 1,
      xcoord: 6, ycoord: 5, channel: 18, username: 'Wasp',
    }));

    await settle(fireTick);

    const events = trace.read(KEY).map((e) => e.event);
    expect(events.slice(0, 3)).toEqual(['scan', 'acquire', 'band close']);
    expect(trace.read(KEY)[0].detail).toBe('1 pilot → Wasp (ch 18) at 1.0 sectors');
    expect(trace.read(KEY)[1].changes).toEqual([{ field: 'cybmine', from: 255, to: 18 }]);
  });

  it('does not log the idle countdown every activation, only the re-roll', async () => {
    const { trace, shipMap, fireTick } = await buildHarness(7);
    shipMap.set(KEY, makeShip({
      userid: 'Cybrg-205', shipno: 205, shpclass: 21, status: 2,
      xcoord: 5, ycoord: 5, cybmine: 255, tick: 1, cybupdate: 50, holdcourse: 0,
    }));

    await settle(fireTick);

    expect(trace.read(KEY).some((e) => e.event === 'idleCadence')).toBe(false);
  });

  it('logs the idle re-roll when it comes round', async () => {
    const { trace, shipMap, fireTick } = await buildHarness(7);
    shipMap.set(KEY, makeShip({
      userid: 'Cybrg-205', shipno: 205, shpclass: 21, status: 2,
      xcoord: 5, ycoord: 5, cybmine: 255, tick: 1, cybupdate: 1, holdcourse: 0,
    }));

    await settle(fireTick);

    const idle = trace.read(KEY).find((e) => e.event === 'idleCadence');
    expect(idle?.changes.map((c) => c.field)).toEqual(['speed2b', 'head2b', 'cybupdate']);
  });
});
