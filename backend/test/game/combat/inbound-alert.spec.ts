/**
 * Canon raises a RED ALERT on the ship being chased, once per tick, for as long
 * as anything is in flight toward it:
 *
 *   if (tptr->distance > 0) {
 *       tptr->distance -= torpsped;
 *       if (flag == 0) { prfmsg(TORP1); outprfge(FILTER,usrn); flag = 1; }
 *   }
 *
 * @see GEFUNCS.C:1595-1603 (TORP1) and :1680-1688 (MISSL1), both in checktm
 *
 * `flag` is the whole subtlety: a three-torpedo volley produces ONE alert per
 * tick, not three. Canon repeats it each tick while the weapon closes, which is
 * what makes it a tracking alert rather than a launch notification — it is the
 * cue to spend a decoy, and the port emitted it never, so `decoy` had no
 * trigger a player could respond to.
 *
 * TORP1 and MISSL1 take no argument: "RED ALERT! Tracking incoming torpedo."
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
import {
  COMBAT_TARGET_WARNING,
  CombatTargetWarningEvent,
} from '../../../src/game/combat/combat-events';

/** Far enough out that a tick of flight does not reach the hull. */
const FAR = 90_000;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 20, ycoord: 20, damage: 0, energy: 50_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    channel: over.channel ?? over.shipno ?? 1,
  } as ShipState;
}

async function harness(ships: ShipState[]) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s); s.dirty = true; return s;
    },
  } as unknown as ShipStateService;

  const subscribers: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_kind: TickKind, h: (c: TickContext) => void) => { subscribers.push(h); return () => {}; },
    registerSnapshotProvider: jest.fn(),
  } as unknown as TickService;

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100_000, maxTons: 5000,
  } as never);

  const events = new EventEmitter2();
  const warnings: CombatTargetWarningEvent[] = [];
  events.on(COMBAT_TARGET_WARNING, (e: CombatTargetWarningEvent) => warnings.push(e));

  const logger = new Logger('inbound-alert-spec');
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  const service = new CombatTickService(
    tickService, shipState,
    { findAllActive: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn() } as unknown as MineRepository,
    new MineRegistry(), new Mulberry32Adapter(1), events, logger, classCache,
  );
  await service.onModuleInit();

  let n = 0;
  const tick = () => {
    const ctx = { kind: TickKind.PHYSICS, tickNumber: ++n, firedAt: new Date() } as TickContext;
    for (const s of subscribers) s(ctx);
  };
  return { tick, warnings };
}

describe('RED ALERT while a weapon is inbound (GEFUNCS.C:1595-1603)', () => {
  it('alerts the ship being chased by a torpedo', async () => {
    const victim = makeShip({
      userid: 'victim', shipno: 1,
      ltorpsChannel: [7, 255, 255], ltorpsDistance: [FAR, 0, 0],
    });
    const { tick, warnings } = await harness([victim]);

    tick();

    expect(warnings.map((w) => ({ kind: w.kind, victim: w.victimId })))
      .toContainEqual({ kind: 'torpedo-inbound', victim: 'victim:1' });
  });

  it('alerts once per tick for a whole volley, not once per torpedo', async () => {
    // Canon's `flag`: three torpedoes tracking produce one RED ALERT.
    const victim = makeShip({
      userid: 'victim', shipno: 1,
      ltorpsChannel: [7, 8, 9], ltorpsDistance: [FAR, FAR, FAR],
    });
    const { tick, warnings } = await harness([victim]);

    tick();

    expect(warnings.filter((w) => w.kind === 'torpedo-inbound')).toHaveLength(1);
  });

  it('repeats the alert on the next tick, because it is a TRACKING alert', async () => {
    const victim = makeShip({
      userid: 'victim', shipno: 1,
      ltorpsChannel: [7, 255, 255], ltorpsDistance: [FAR, 0, 0],
    });
    const { tick, warnings } = await harness([victim]);

    tick();
    tick();

    expect(warnings.filter((w) => w.kind === 'torpedo-inbound')).toHaveLength(2);
  });

  it('says nothing when nothing is inbound', async () => {
    const quiet = makeShip({ userid: 'quiet', shipno: 1 });
    const { tick, warnings } = await harness([quiet]);

    tick();

    expect(warnings).toHaveLength(0);
  });

  it('alerts separately for an inbound missile', async () => {
    const victim = makeShip({
      userid: 'victim', shipno: 1,
      lmisslChannel: [7, 255, 255], lmisslDistance: [FAR, 0, 0], lmisslEnergy: [500, 0, 0],
    });
    const { tick, warnings } = await harness([victim]);

    tick();

    expect(warnings.map((w) => w.kind)).toContain('missile-inbound');
  });
});
