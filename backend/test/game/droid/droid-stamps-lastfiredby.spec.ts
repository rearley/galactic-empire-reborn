/**
 * A droid that damages a ship must record WHO fired, not just which channel.
 *
 * `lastfiredBy` is this port's answer to a problem canon does not have: channels
 * are recycled densely enough that `ShipStateService.leave()` has to scrub every
 * `lastfired` aimed at a channel it is reusing, which destroys the evidence the
 * kill needs. Every other damage path stamps the name beside the channel — the
 * Cybertron phaser at cybertron-tick.service.ts:547-548, the player phaser, the
 * projectile carrier in combat-tick. All three droid paths wrote the channel and
 * left the name behind.
 *
 * `attackerNameFromLastFired` returns a name only when the recorded channel
 * still matches `lastfired`, so an unstamped droid hit does not merely lose the
 * droid's name — it strands whatever the PREVIOUS attacker stamped, and the kill
 * resolves to nobody. A droid grazing a ship a player was fighting was enough to
 * void that player's credit, with the droid still alive and the despawn scrub
 * never involved.
 *
 * Observed in production 2026-09-16: a Stealth Fighter died with
 * `lastfired=17 lastfiredBy=none`, credited to no one.
 *
 * Canon records the channel and stops there; this port has to record the name
 * too, because it recycles channels and canon does not.
 *
 * @see GECMDS.C:977 `wptr->lastfired = usrn;` — firep
 * @see GECMDS.C:1079 `wptr->lastfired = usrn;` — firehp
 * @see https://github.com/rearley/galactic-empire-reborn/issues/42
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
import { attackerNameFromLastFired } from '../../../src/game/combat/kill-resolution';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import {
  DROID_CLASS_SCOW, DROID_USERID_PREFIX, GESTAT_USER,
} from '../../../src/game/constants';

/** `shieldstat === 1` is SHIELDUP; the production code tests the literal too. */
const SHIELDUP = 1;

const HALF: Random = { next: () => 0.5 };
const DROID_CHANNEL = 1;
const DROID_NAME = 'Scow';

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
    where: 0,
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
    channel: over.channel ?? over.shipno ?? 2,
    ...over,
  });
}

function harness(target: ShipState) {
  const droid = makeShip({
    userid: `${DROID_USERID_PREFIX}1`, shipno: 1, shipname: DROID_NAME,
    shpclass: DROID_CLASS_SCOW, status: 2, channel: DROID_CHANNEL,
    xcoord: 5, ycoord: 5, heading: 0, phasrtype: 1, where: target.where,
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

  const svc = new DroidTickService(
    { subscribe: vi.fn() } as unknown as TickService,
    shipState, classCache,
    new DroidSpawner(shipState, classCache, HALF),
    { add: vi.fn(), hydrate: vi.fn() } as unknown as MineRegistry,
    { create: vi.fn().mockResolvedValue({ id: 1 }) } as unknown as MineRepository,
    new EventEmitter2(), HALF,
  );

  const inner = svc as unknown as {
    firePhaser: (d: ShipState, t: ShipState) => void;
    fireHyperPhaser: (d: ShipState, t: ShipState, dd: number) => void;
  };

  return {
    phaser: () => inner.firePhaser(droid, target),
    hyper: (dd: number) => inner.fireHyperPhaser(droid, target, dd),
  };
}

/** Everything a live droid's stamp must satisfy for the kill to resolve. */
function expectCredited(target: ShipState) {
  expect(target.lastfired).toBe(DROID_CHANNEL);
  expect(target.lastfiredBy).toEqual({ channel: DROID_CHANNEL, name: DROID_NAME });
  // The channel is still held — the droid is alive — so this is the ordinary
  // `recorded.channel === victim.lastfired` branch, not the scrub fallback.
  expect(attackerNameFromLastFired(target, () => true, target.channel)).toBe(DROID_NAME);
}

describe('a droid records who fired, on every path that damages a ship', () => {
  it('phaser, shields down', () => {
    const target = makeShip({ xcoord: 5, ycoord: 4.95, shieldstat: 0 });
    harness(target).phaser();
    expectCredited(target);
  });

  it('phaser, shields up — the shield branch mutates separately and must stamp too', () => {
    const target = makeShip({ xcoord: 5, ycoord: 4.95, shieldstat: SHIELDUP, shield: 5 });
    harness(target).phaser();
    expectCredited(target);
  });

  it('hyper-phaser, against a ship in hyperspace', () => {
    const target = makeShip({ xcoord: 5, ycoord: 4.9, where: 1 });
    harness(target).hyper(1_000);
    expectCredited(target);
  });

  it('does not strand a previous attacker: the droid overwrites both fields together', () => {
    const target = makeShip({
      xcoord: 5, ycoord: 4.95, shieldstat: 0,
      lastfired: 9, lastfiredBy: { channel: 9, name: 'SomeoneElse' },
    });
    harness(target).phaser();
    // Before the fix `lastfired` became 1 while `lastfiredBy` still said
    // channel 9 — a mismatch `attackerNameFromLastFired` resolves to null.
    expectCredited(target);
  });
});
