/**
 * The bank tells you when it can fire, and when it is full.
 *
 *   if ((ptr->phasr < PMINFIRE) && (ptr->phasr + preload >= PMINFIRE))
 *       { prfmsg(PHSRUP); outprfge(ALWAYS,usrn); }
 *   ptr->phasr = ptr->phasr + preload;
 *   if (ptr->phasr >= 100)
 *       { prfmsg(PHSRMAX); outprfge(ALWAYS,usrn); ptr->phasr = 100; }
 *
 * @see GEFUNCS.C:1026-1050 checkdam
 *
 * These two lines are the whole feedback loop of the reload cadence. A Mark-1
 * fires every 36 seconds and a Mark-2 every 18 (CLAUDE.md derives this from
 * PRELOAD and shieldchg), and canon's rhythm is: break off, wait for "Phaser
 * banks are at full power, Sir!", re-engage. Without them the only way to know
 * the bank is ready is to fire and see, or to poll `rep` — so a pilot either
 * wastes shots or wastes time.
 *
 * PHSRUP fires on the CROSSING, not on every tick above the threshold: canon
 * tests `phasr < PMINFIRE && phasr + preload >= PMINFIRE` before adding.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { PMINFIRE } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import {
  SHIP_PHASER_CHARGE,
  ShipPhaserChargeEvent,
} from '../../../src/game/ship/repair-events';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'u',
    shipname: 'S',
    xcoord: 20,
    ycoord: 20,
    energy: 500_000,
    phasrtype: 1,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 10,
    ...over,
  });
}

async function harness(ship: ShipState) {
  const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
  } as unknown as ShipStateService;

  const subs: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_k: TickKind, fn: (c: TickContext) => void) => { subs.push(fn); return () => {}; },
    registerSnapshotProvider: vi.fn(),
  } as unknown as TickService;

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100_000, maxTons: 5000,
  } as never);

  const events = new EventEmitter2();
  const charges: ShipPhaserChargeEvent[] = [];
  events.on(SHIP_PHASER_CHARGE, (e: ShipPhaserChargeEvent) => charges.push(e));

  const logger = new Logger('phaser-charge-spec');
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);

  const svc = new CombatTickService(
    tickService, shipState,
    { findAllActive: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn() } as unknown as MineRepository,
    new MineRegistry(), new Mulberry32Adapter(1), events, logger, classCache,
  );
  await svc.onModuleInit();

  let n = 0;
  const tick = () => {
    const ctx = { kind: TickKind.PHYSICS, tickNumber: ++n, firedAt: new Date() } as TickContext;
    for (const fn of subs) fn(ctx);
  };
  return { tick, charges };
}

describe('phaser charge notices (GEFUNCS.C:1026-1050)', () => {
  it('announces the bank reaching minimum fire power', async () => {
    // A Mark-1 adds PRELOAD per tick; start just below the threshold.
    const ship = makeShip({ phasr: PMINFIRE - 1, phasrtype: 1 });
    const { tick, charges } = await harness(ship);

    tick();

    expect(charges.map((c) => c.level)).toContain('minimum');
  });

  it('does not repeat it on later ticks above the threshold', async () => {
    const ship = makeShip({ phasr: PMINFIRE - 1, phasrtype: 1 });
    const { tick, charges } = await harness(ship);

    tick(); tick(); tick();

    expect(charges.filter((c) => c.level === 'minimum')).toHaveLength(1);
  });

  it('announces the bank reaching full power', async () => {
    const ship = makeShip({ phasr: 99, phasrtype: 1 });
    const { tick, charges } = await harness(ship);

    tick();

    expect(charges.map((c) => c.level)).toContain('full');
  });

  it('says nothing on an ordinary tick mid-charge', async () => {
    const ship = makeShip({ phasr: 0, phasrtype: 1 });
    const { tick, charges } = await harness(ship);

    tick();

    expect(charges).toHaveLength(0);
  });
});
