/**
 * A droid phaser shot that lands for nothing still empties the bank.
 *
 * Canon's `firep` puts the discharge OUTSIDE the whole target loop:
 *
 *   for (othusn=0 ; othusn < nships ; othusn++)
 *     { ... if (damage >= 1) { lastfired, cantexit, damage, randamage } ... }
 *   ptr->phasr = 0;                                  -- GECMDS.C:1006
 *
 * So `damage >= 1` gates the CONSEQUENCES, and only those. Pulling the trigger
 * costs the bank whatever the shot achieves, which is what makes range
 * discipline matter: a droid that grazes you at two sectors has to sit through
 * a full `preload` cycle before it can fire again.
 *
 * The port had the `damage < 1` case return early, skipping the tail — so a
 * droid firing beyond effective range kept a hot bank indefinitely and could
 * open at full charge the instant its target closed. `cantexit` correctly stays
 * unset, because canon's copy of that line IS inside the gate (GECMDS.C:977).
 *
 * @see GECMDS.C:975-1006 firep
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
import { COMBAT_HIT } from '../../../src/game/combat/combat-events';
import {
  DROID_CLASS_SCOW, DROID_USERID_PREFIX, GESTAT_USER, PMINFIRE, FIRETICKS,
} from '../../../src/game/constants';

const HALF: Random = { next: () => 0.5 };

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'p1', shipno: 1, shipname: 'Victim', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50_000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: -1,
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

function harness(target: ShipState) {
  const droid = makeShip({
    userid: `${DROID_USERID_PREFIX}1`, shipno: 1, shipname: 'Scow',
    shpclass: DROID_CLASS_SCOW, status: 2, channel: 1,
    xcoord: 5, ycoord: 5, heading: 0, phasr: 100, phasrtype: 1,
  });

  const shipMap = new Map<string, ShipState>([
    [`${droid.userid}:1`, droid],
    [`${target.userid}:${target.shipno}`, target],
  ]);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (u: string, n: number) => shipMap.get(`${u}:${n}`),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${u}:${n}`);
      if (s) fn(s);
      return s;
    },
    loadShip: jest.fn(), removeFromGame: jest.fn(),
    size: () => shipMap.size, findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: () => ({ scanRange: 250_000, maxTons: 100, hasTorpedo: false }),
    getScanRange: () => 250_000,
    getMaxTons: () => 100,
    getMaxShields: () => 1,
    getMaxPhaser: () => 1,
  } as unknown as ShipClassCacheService;

  const events = new EventEmitter2();
  const hits: unknown[] = [];
  events.on(COMBAT_HIT, (e) => hits.push(e));

  const svc = new DroidTickService(
    { subscribe: jest.fn() } as unknown as TickService,
    shipState, classCache,
    new DroidSpawner(shipState, classCache, HALF),
    { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry,
    { create: jest.fn().mockResolvedValue({ id: 1 }) } as unknown as MineRepository,
    events, HALF,
  );

  const fire = () => (svc as unknown as {
    firePhaser: (d: ShipState, t: ShipState) => void;
  }).firePhaser(droid, target);

  return { droid, fire, hits };
}

describe('a droid phaser discharges the bank whatever the shot achieves', () => {
  it('empties the bank on a shot that rounds to zero damage', () => {
    // 1.8 sectors with a Mark-1: dd = 1 - 18000/24000 = 0.25, and 0.25^5 puts
    // the base under a single point before tonnage is even applied.
    const target = makeShip({ xcoord: 5, ycoord: 3.2 });
    const { droid, fire, hits } = harness(target);
    fire();
    expect(hits).toHaveLength(0); // proves the zero-damage path was taken
    expect(droid.phasr).toBe(0);
  });

  it('does NOT lock the firer into combat on a zero-damage shot', () => {
    // `ptr->cantexit = FIRETICKS` sits inside canon's `damage >= 1` block.
    const target = makeShip({ xcoord: 5, ycoord: 3.2 });
    const { droid, fire } = harness(target);
    fire();
    expect(droid.cantexit).toBe(0);
  });

  it('still empties the bank and locks in on a shot that connects', () => {
    const target = makeShip({ xcoord: 5, ycoord: 4.9 });
    const { droid, fire, hits } = harness(target);
    fire();
    expect(hits.length).toBeGreaterThan(0);
    expect(droid.phasr).toBe(0);
    expect(droid.cantexit).toBe(FIRETICKS);
  });

  it('leaves a cold bank alone — below PMINFIRE nothing is spent', () => {
    const target = makeShip({ xcoord: 5, ycoord: 4.9 });
    const { droid, fire } = harness(target);
    droid.phasr = PMINFIRE - 1;
    fire();
    expect(droid.phasr).toBe(PMINFIRE - 1);
  });
});
