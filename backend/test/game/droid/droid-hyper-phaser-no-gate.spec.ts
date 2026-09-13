/**
 * A droid's hyper-phaser has no minimum-damage gate, because canon's has none.
 *
 * `firep` wraps its consequences in `if (damage >= 1)` (GECMDS.C:975). `firehp`
 * does not — inside the arc and inside scan range it goes straight to
 *
 *   wptr->damage += (double)damage;
 *   wptr->lastfired = usrn;
 *   wptr->cantexit = FIRETICKS;
 *   ptr->cantexit = FIRETICKS;
 *   randamage(wptr,othusn);          -- GECMDS.C:1078-1082
 *
 * with no test on `damage` at all. So a hyper-phaser graze that adds nothing to
 * the hull still battle-locks the victim and still rolls for random system
 * damage. That is the weapon's character: it reaches into hyperspace, where
 * shields do not apply and the target cannot scan.
 *
 * The port's shared helper and its Cybertron caller both follow canon. The
 * Droid copy had picked up `firep`'s gate, so a droid grazing a ship in transit
 * did nothing at all where a Cybertron in the same position knocked a system
 * out. One weapon, two behaviours, depending on which hull fired it.
 *
 * @see GECMDS.C:1020-1085 firehp
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
import { hyperPhaserDamage } from '../../../src/game/combat/combat-math';
import { COMBAT_HIT } from '../../../src/game/combat/combat-events';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import {
  DROID_CLASS_SCOW, DROID_USERID_PREFIX, GESTAT_USER, FIRETICKS,
} from '../../../src/game/constants';

const HALF: Random = { next: () => 0.5 };

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'p1',
    shipname: 'Victim',
    xcoord: 5,
    ycoord: 5,
    energy: 50_000,
    phasr: 100,
    phasrtype: 1,
    lastfired: -1,
    shieldtype: 1,
    shield: 1,
    where: 1,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    freq: [],
    items: new Array(14).fill(0n) as bigint[],
    status: GESTAT_USER,
    cybmine: 255,
    tick: 255,
    topspeed: 8,
    channel: over.channel ?? over.shipno ?? 1,
    ...over,
  });
}

function harness(target: ShipState) {
  const droid = makeShip({
    userid: `${DROID_USERID_PREFIX}1`, shipno: 1, shipname: 'Scow',
    shpclass: DROID_CLASS_SCOW, status: 2, channel: 1,
    xcoord: 5, ycoord: 5, heading: 0, phasrtype: 1, where: 1,
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
    loadShip: vi.fn(), removeFromGame: vi.fn(),
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
  const hits: Array<{ damageHull: number }> = [];
  events.on(COMBAT_HIT, (e) => hits.push(e as { damageHull: number }));

  const svc = new DroidTickService(
    { subscribe: vi.fn() } as unknown as TickService,
    shipState, classCache,
    new DroidSpawner(shipState, classCache, HALF),
    { add: vi.fn(), hydrate: vi.fn() } as unknown as MineRegistry,
    { create: vi.fn().mockResolvedValue({ id: 1 }) } as unknown as MineRepository,
    events, HALF,
  );

  const fire = (ddist: number) => (svc as unknown as {
    fireHyperPhaser: (d: ShipState, t: ShipState, dd: number) => void;
  }).fireHyperPhaser(droid, target, ddist);

  return { droid, fire, hits };
}

/** 2.5 sectors with a Mark-1 — chosen because the arithmetic rounds to nothing. */
const FAR_Y = 2.5;
const FAR_DDIST = 25_000;

describe('a droid hyper-phaser applies its consequences whatever the damage', () => {
  it('the chosen geometry really does round to zero damage', () => {
    expect(hyperPhaserDamage({ phasrtype: 1, distRaw: FAR_DDIST, victimMaxTons: 100 })).toBe(0);
  });

  it('battle-locks a victim it grazes for nothing', () => {
    const target = makeShip({ xcoord: 5, ycoord: 5 - FAR_Y });
    const { fire } = harness(target);
    fire(FAR_DDIST);
    expect(target.cantexit).toBe(FIRETICKS);
    expect(target.lastfired).toBe(1);
  });

  it('still reports the hit, at zero hull damage', () => {
    const target = makeShip({ xcoord: 5, ycoord: 5 - FAR_Y });
    const { fire, hits } = harness(target);
    fire(FAR_DDIST);
    expect(hits).toHaveLength(1);
    expect(hits[0].damageHull).toBe(0);
  });

  it('still applies real damage at close range', () => {
    const target = makeShip({ xcoord: 5, ycoord: 4.9 });
    const { fire } = harness(target);
    fire(1_000);
    expect(target.damage).toBeGreaterThan(0);
  });
});
