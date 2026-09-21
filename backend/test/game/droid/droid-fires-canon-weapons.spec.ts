/**
 * A Droid fires the player's own weapons, as canon's does.
 *
 * GEDROIDS.C calls the very functions a player's commands call:
 *
 *   GEDROIDS.C:366 `firep(ptr,usrn);`
 *   GEDROIDS.C:354 `firehp(ptr,usrn);`
 *   GEDROIDS.C:482 `torp(ptr,usrn,zothusn);`
 *   GEDROIDS.C:512 `laymine(ptr,usrn,10);`
 *
 * The port had grown the Droid its own copies, and they drifted furthest of the
 * three. Above all, the phaser: canon does not aim it. Before `firep` the Droid
 * sets
 *
 *   GEDROIDS.C:361 `ptr->degrees = 0;`
 *   GEDROIDS.C:362 `ptr->percent = 2;`
 *
 * — a focus-2 sweep straight down its own nose, hitting whatever is in that arc.
 * The port's copy computed a bearing to the target and hit only that ship. Now
 * the Droid fires through `AiWeapons`, the same code a Cybertron fires through.
 * @see issue #62, docs/DECISIONS.md 2026-09-21
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
import { COMBAT_HIT, COMBAT_TARGET_WARNING } from '../../../src/game/combat/combat-events';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import {
  DROID_CLASS_VAKORY, DROID_USERID_PREFIX, FIRETICKS, GESTAT_AUTO, GESTAT_USER, HPMINFIR,
} from '../../../src/game/constants';
import { I_MINE, I_TORP } from '../../../src/game/constants/items';

function ship(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'p1', shipname: 'Victim', xcoord: 5, ycoord: 5, energy: 50_000,
    phasr: 100, phasrtype: 1, lastfired: -1, shieldtype: 1, shield: 0, shieldstat: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    freq: [], items: new Array(14).fill(0n) as bigint[], status: GESTAT_USER,
    cybmine: 255, tick: 255, topspeed: 8,
    channel: over.channel ?? over.shipno ?? 1,
    ...over,
  });
}

/** A droid at (5,5) facing north (heading 0; north is -y). */
function harness(others: ShipState[], draws: () => number = () => 0.5) {
  const droid = ship({
    userid: `${DROID_USERID_PREFIX}1`, shipno: 1, shipname: 'Vakory', shpclass: DROID_CLASS_VAKORY,
    status: GESTAT_AUTO, channel: 7, heading: 0, phasr: 100, phasrtype: 1,
  });
  const map = new Map([droid, ...others].map((s) => [`${s.userid}:${s.shipno}`, s]));
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    get: (u: string, n: number) => map.get(`${u}:${n}`),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => { const s = map.get(`${u}:${n}`); if (s) fn(s); return s; },
    loadShip: vi.fn(), removeFromGame: vi.fn(), size: () => map.size, findByUserid: () => [],
  } as unknown as ShipStateService;
  const classCache = {
    get: () => ({ scanRange: 250_000, maxTons: 100, hasTorpedo: true }),
    getScanRange: () => 250_000, getMaxTons: () => 100, getMaxShields: () => 1, getMaxPhaser: () => 1,
  } as unknown as ShipClassCacheService;
  const events = new EventEmitter2();
  const hits: Array<{ victimId: string }> = [];
  const warnings: unknown[] = [];
  events.on(COMBAT_HIT, (e: { victimId: string }) => hits.push(e));
  events.on(COMBAT_TARGET_WARNING, (e: unknown) => warnings.push(e));
  let drawn = 0;
  const random: Random = { next: () => { drawn++; return draws(); } };
  const mineRepo = { create: vi.fn().mockResolvedValue({ id: 1, channel: 7, timer: 10, xcoord: 5, ycoord: 5 }) };
  const svc = new DroidTickService(
    { subscribe: vi.fn() } as unknown as TickService,
    shipState, classCache,
    new DroidSpawner(shipState, classCache, random),
    { add: vi.fn(), hydrate: vi.fn(), getAll: () => [] } as unknown as MineRegistry,
    mineRepo as unknown as MineRepository,
    events, random,
  );
  const priv = svc as unknown as {
    firePhaser(d: ShipState, t: ShipState): void;
    fireHyperPhaser(d: ShipState, t: ShipState, ddist: number): void;
    launchTorpedo(d: ShipState, t: ShipState, ddist: number, announce?: boolean): void;
    layMine(d: ShipState): void;
  };
  return { droid, priv, hits, warnings, mineRepo, drawn: () => drawn };
}

describe('a Droid phaser is canon firep: down the nose, focus 2', () => {
  it('sets degrees 0 and percent 2 before it fires (GEDROIDS.C:361-362)', () => {
    const target = ship({ xcoord: 5.05, ycoord: 5 });
    const { droid, priv } = harness([target]);
    priv.firePhaser(droid, target);
    expect(droid.degrees).toBe(0);
    expect(droid.percent).toBe(2);
  });

  it('does not aim: a target 90 degrees off the bow is untouched, and the bank is spent', () => {
    const target = ship({ xcoord: 5.05, ycoord: 5 }); // due east
    const { droid, priv, hits } = harness([target]);
    priv.firePhaser(droid, target);
    expect(hits).toEqual([]);
    expect(droid.phasr).toBe(0);
  });

  it('hits whatever is in the arc — a bystander dead ahead, though it is not the target', () => {
    const target = ship({ userid: 'p1', shipno: 1, xcoord: 5.05, ycoord: 5 });
    const bystander = ship({ userid: 'p2', shipno: 1, channel: 2, xcoord: 5, ycoord: 4.95 });
    const { droid, priv, hits } = harness([target, bystander]);
    priv.firePhaser(droid, target);
    expect(hits.map((h) => h.victimId)).toEqual(['p2:1']);
  });

  it('turns a Cybertron caught in the sweep onto the droid — canon firep provokes (GECMDS.C:981)', () => {
    const target = ship({ xcoord: 5.05, ycoord: 5 });
    const cyb = ship({ userid: 'Cybrg-205', shipno: 205, channel: 9, status: GESTAT_AUTO, cybmine: 255, xcoord: 5, ycoord: 4.95 });
    const { droid, priv } = harness([target, cyb]);
    priv.firePhaser(droid, target);
    expect(cyb.cybmine).toBe(7);
  });
});

describe('a Droid hyper-phaser is canon firehp', () => {
  it('aims at its target, sweeps the beam, and rolls randamage on the hit (GECMDS.C:1082)', () => {
    const target = ship({ xcoord: 5.1, ycoord: 5, where: 1 });
    const { droid, priv, hits, drawn } = harness([target]);
    droid.where = 1;
    droid.energy = HPMINFIR;
    priv.fireHyperPhaser(droid, target, 1000);
    expect(droid.degrees).toBe(90);
    expect(hits.map((h) => h.victimId)).toEqual(['p1:1']);
    // firehp's damage is deterministic; any draw after the hit is randamage.
    expect(drawn()).toBeGreaterThan(0);
  });
});

describe('a Droid torpedo is canon torp', () => {
  it('spends a torpedo and warns its target as the tube fires (GECMDS.C:1195, :1198)', () => {
    const target = ship({ xcoord: 5, ycoord: 4.95 });
    const { droid, priv, warnings } = harness([target]);
    droid.items[I_TORP] = 3n;
    priv.launchTorpedo(droid, target, 500, true);
    expect(droid.items[I_TORP]).toBe(2n);
    expect(target.ltorpsChannel[0]).toBe(7);
    expect(warnings).toHaveLength(1);
  });
});

describe('a Droid mine is canon laymine', () => {
  it('carries the droid\'s CHANNEL, so a mine kill can name who laid it, and takes the combat lock', async () => {
    const { droid, priv, mineRepo } = harness([]);
    droid.items[I_MINE] = 2n;
    priv.layMine(droid);
    await new Promise((r) => setImmediate(r));
    expect(mineRepo.create).toHaveBeenCalledWith(expect.objectContaining({ channel: 7 }));
    expect(droid.items[I_MINE]).toBe(1n);
    expect(droid.cantexit).toBe(FIRETICKS);
  });
});
