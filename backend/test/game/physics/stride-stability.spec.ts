/**
 * A ship's movement cadence must not change because ANOTHER ship joined or died.
 *
 * Canon strides the ship table by 3 on the 1-second timer, indexed by
 * `zothusn` — the ship's own table slot, which is fixed for as long as it is in
 * the game:
 *
 *   zothusn = clicker;
 *   while (zothusn < nships) { if (ingegame(zothusn)) { ...move... } zothusn += 3; }
 *   clicker = (clicker+1)%3;
 *
 * @see GEMAIN.C:2462-2493 warrti2a
 *
 * The port strided on POSITION in a freshly sorted array instead. Position is
 * not stable: every ship after a departure shifts down one, and every ship
 * after an arrival shifts up one. A ship that had been moving on clicker 0
 * silently becomes a clicker-1 ship — so depending on where in the cycle the
 * change lands it either moves twice in consecutive seconds, a double-length
 * step, or waits up to five seconds and then makes one.
 *
 * Cybertrons die and respawn constantly and players board and unboard, so this
 * fires often, and the visible result is exactly what was reported from play:
 * a ship being chased "jumped distances". Rotation, acceleration and the
 * self-destruct countdown ride the same strided loop, so they stutter too.
 *
 * `channel` is this port's `usrnum` (ship-state.types.ts:42) — allocated once
 * when a ship enters the game and held until it leaves. Striding on it makes
 * the cadence a property of the ship rather than of the fleet around it.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';

const SPEED = 6_500; // one step = 0.1 sectors, along heading 90 (+x)

function makeShip(userid: string, channel: number): ShipState {
  // Spread them out and keep them well inside the universe edge: stacked ships
  // interact and a ship past UNIVMAX is telezipped to a stop. This file is
  // about scheduling, not either of those.
  const x = -8 + channel * 2;
  return {
    userid, shipno: 1, shipname: userid, shpclass: 1, channel,
    heading: 90, head2b: 90, speed: SPEED, speed2b: SPEED,
    xcoord: x, ycoord: 0, damage: 0, energy: 5_000_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 20, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  } as ShipState;
}

function harness(ships: ShipState[]) {
  const map = new Map<string, ShipState>();
  for (const s of ships) map.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(map.values()),
    get: (u: string, n: number) => map.get(shipKey(u, n)),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
  } as unknown as ShipStateService;

  const subs: Array<{ kind: TickKind; fn: (c: TickContext) => void }> = [];
  const tickService = {
    subscribe: (kind: TickKind, fn: (c: TickContext) => void) => { subs.push({ kind, fn }); return () => {}; },
  } as unknown as TickService;

  const shipClassCache = {
    get: () => ({ maxAcceleration: 5000, maxWarp: 20, scanRange: 100_000, maxTons: 1000 }),
    getMaxAcceleration: () => 5000, getMaxWarp: () => 20, getTopSpeed: () => 20_000,
  } as unknown as ShipClassCacheService;

  const svc = new PhysicsTickService(tickService, shipState, shipClassCache, new EventEmitter2());
  svc.onModuleInit();

  let n = 0;
  const second = () => {
    const ctx = { kind: TickKind.SHIP_UPDATE, tickNumber: ++n, firedAt: new Date() } as TickContext;
    for (const s of subs) if (s.kind === TickKind.SHIP_UPDATE) s.fn(ctx);
  };

  /** Which ships moved during one second. */
  const movedThisSecond = (): string[] => {
    const before = new Map([...map].map(([k, s]) => [k, s.xcoord]));
    second();
    return [...map].filter(([k, s]) => s.xcoord !== before.get(k)).map(([k]) => k);
  };

  return {
    map,
    movedThisSecond,
    add: (s: ShipState) => map.set(shipKey(s.userid, s.shipno), s),
    remove: (userid: string) => map.delete(shipKey(userid, 1)),
  };
}

/**
 * The seconds on which each ship moved, over `n` seconds.
 *
 * Counting moves per fixed window is not enough: a ship whose slot shifts still
 * moves once per window most of the time, just on the wrong second. What gives
 * the defect away is the GAP between a ship's own moves — canon's is always
 * exactly three, and a shift produces a 1, 2, 4 or 5.
 */
function moveSeconds(h: ReturnType<typeof harness>, n: number, churn: (i: number) => void = () => {}): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    churn(i);
    for (const k of h.movedThisSecond()) out.set(k, [...(out.get(k) ?? []), i]);
  }
  return out;
}

/** Every interval between one ship's consecutive moves. */
function gaps(seconds: number[]): number[] {
  return seconds.slice(1).map((s, i) => s - seconds[i]);
}

const FLEET = () => [
  makeShip('cyb-a', 1), makeShip('cyb-b', 2), makeShip('cyb-c', 3),
  makeShip('cyb-d', 4), makeShip('cyb-e', 5), makeShip('cyb-f', 6),
];

describe('movement stride is a property of the ship, not of the fleet', () => {
  it('moves every ship exactly once per three seconds in a settled fleet', () => {
    const h = harness(FLEET());
    const moves = moveSeconds(h, 9);

    expect(moves.size).toBe(6);
    for (const [, seconds] of moves) {
      expect(seconds).toHaveLength(3);
      expect(gaps(seconds)).toEqual([3, 3]);
    }
  });

  it('keeps every survivor on cadence when a ship is destroyed mid-cycle', () => {
    const h = harness(FLEET());
    const moves = moveSeconds(h, 9, (i) => { if (i === 4) h.remove('cyb-a'); });

    for (const [key, seconds] of moves) {
      if (key === 'cyb-a:1') continue; // gone at second 4, by design
      expect(gaps(seconds)).toEqual([3, 3]);
    }
  });

  it('keeps every ship on cadence when one spawns mid-cycle', () => {
    // `cyb-0` sorts FIRST, so a position-indexed stride shifts every other
    // ship's slot the moment it appears.
    const h = harness(FLEET());
    const moves = moveSeconds(h, 9, (i) => { if (i === 4) h.add(makeShip('cyb-0', 7)); });

    for (const s of ['cyb-a', 'cyb-b', 'cyb-c', 'cyb-d', 'cyb-e', 'cyb-f']) {
      expect(gaps(moves.get(`${s}:1`) ?? [])).toEqual([3, 3]);
    }
  });

  it('holds the cadence through sustained churn', () => {
    // The two failure modes are symmetric and both visible from the cockpit: a
    // gap of 1 or 2 is a ship taking a double-length step in the time a pilot
    // expected one — the "jump" reported from play — and a gap of 4 or 5 is a
    // stall that lurches when it resumes. Neither may happen because some OTHER
    // ship spawned or died.
    const h = harness(FLEET());
    const moves = moveSeconds(h, 15, (i) => {
      if (i === 2) h.remove('cyb-c');
      if (i === 5) h.add(makeShip('cyb-0', 7));
      if (i === 8) h.remove('cyb-0');
      if (i === 11) h.add(makeShip('cyb-z', 8));
    });

    for (const s of ['cyb-a', 'cyb-b', 'cyb-d', 'cyb-e', 'cyb-f']) {
      expect(gaps(moves.get(`${s}:1`) ?? [])).toEqual([3, 3, 3, 3]);
    }
  });
});
