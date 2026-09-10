/**
 * A Garbage Scow that spots a player reacts three times as often.
 *
 * Canon sets the countdown INSIDE each class brain, in the scan-range branch:
 *
 *   if (ddist < (double)shipclass[ptr->shpclass].scanrange)
 *     {
 *     ptr->tick = CYBTICKTIME + gernd()%CYBTICKTIME;
 *     droid_annoy(ptr,zothusn,4,DRDMSG6,DRDMSG6);
 *     }
 *   -- GEDROIDS.C:277-282, and identically at :340 (Murdonian) and :442 (Vakory)
 *
 * `droid_lives` then re-arms only what the brain LEFT alone — `if (ptr->tick ==
 * 255)` at GEDROIDS.C:215 — and that fallback is the one that multiplies by 3.
 * So detection is what buys the short countdown, for all three classes.
 *
 * The port hoisted that decision out of the brains and into the caller, where
 * it reads a `detected` flag off the returned action. `actClass11` and
 * `actClass12` return one. `actClass10` returned `void`, so the Scow's flag was
 * always false and a Scow that had a player in scan range still waited the full
 * cruising interval before looking again.
 *
 * Found by a coverage audit reading the three brains side by side, not in play.
 *
 * @see GEDROIDS.C:253-298 droid_act_class_10
 */
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Random } from '../../../src/game/combat/random.port';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import type { TickContext } from '../../../src/game/tick/tick.types';
import {
  CYBTICKTIME, DROID_CLASS_SCOW, DROID_USERID_PREFIX, GESTAT_USER,
} from '../../../src/game/constants';

/** A fixed draw so the countdown is arithmetic, not a distribution. */
const HALF: Random = { next: () => 0.5 };
/** `CYBTICKTIME + floor(0.5 * CYBTICKTIME)` = 6 + 3. */
const SHORT = CYBTICKTIME + Math.floor(0.5 * CYBTICKTIME);
const LONG = SHORT * 3;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'p1', shipno: 1, shipname: 'Victim', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50_000,
    phasr: 100, phasrtype: 5, kills: 0, lastfired: -1,
    shieldtype: 1, shieldstat: 0, shield: 1, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [],
    items: new Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: GESTAT_USER, cybmine: 255, cybskill: 0,
    cybupdate: 0, tick: 255, emulate: 0, minesnear: 0, lock: 0,
    holdcourse: 0, topspeed: 8, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
    channel: over.channel ?? over.shipno ?? 1,
  } as ShipState;
}

function harness(players: ShipState[]) {
  const scow = makeShip({
    userid: `${DROID_USERID_PREFIX}1`, shipno: 1, shipname: 'Scow',
    shpclass: DROID_CLASS_SCOW, status: 2, channel: 1, speed: 0,
  });

  const shipMap = new Map<string, ShipState>([[`${scow.userid}:1`, scow]]);
  for (const p of players) shipMap.set(`${p.userid}:${p.shipno}`, p);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (u: string, n: number) => shipMap.get(`${u}:${n}`),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${u}:${n}`);
      if (s) fn(s);
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: jest.fn(),
    size: () => shipMap.size,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: () => ({ scanRange: 250_000, maxTons: 10_000, hasTorpedo: false }),
    getScanRange: () => 250_000,
    getMaxTons: () => 10_000,
    getMaxShields: () => 1,
    getMaxPhaser: () => 0,
  } as unknown as ShipClassCacheService;

  const svc = new DroidTickService(
    { subscribe: jest.fn() } as unknown as TickService,
    shipState, classCache,
    new DroidSpawner(shipState, classCache, HALF),
    { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry,
    { create: jest.fn().mockResolvedValue({ id: 1 }) } as unknown as MineRepository,
    new EventEmitter2(), HALF,
  );

  const act = () => (svc as unknown as {
    actOnDroid: (u: string, c: number, p: ShipState[], ctx: TickContext) => void;
  }).actOnDroid(scow.userid, DROID_CLASS_SCOW, players, { tickNumber: 1 } as TickContext);

  return { scow, act };
}

describe('a Garbage Scow re-arms on detection, as canon does inside the brain', () => {
  it('takes the SHORT countdown when a player sits inside scan range', () => {
    const player = makeShip({ xcoord: 5.1, ycoord: 5 });
    const { scow, act } = harness([player]);
    act();
    expect(scow.tick).toBe(SHORT);
  });

  it('still takes the LONG cruising countdown with the galaxy empty', () => {
    const { scow, act } = harness([]);
    act();
    expect(scow.tick).toBe(LONG);
  });

  it('takes the LONG countdown for a player far outside scan range', () => {
    // 250_000 scan range is 25 sectors; 40 is comfortably beyond it.
    const player = makeShip({ xcoord: 45, ycoord: 5 });
    const { scow, act } = harness([player]);
    act();
    expect(scow.tick).toBe(LONG);
  });
});
