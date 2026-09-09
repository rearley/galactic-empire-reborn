/**
 * The helm talks while the engines spool, and says so when they quit.
 *
 * Canon's `accel()` prints on three occasions this port was silent for:
 *
 *   if (useenergy(ptr,usrn,usage) == 1) {
 *       if ((int)(ptr->speed/1000) != (int)((ptr->speed + accelrate)/1000)) {
 *           prfmsg(WARP,(int)((ptr->speed + accelrate)/1000));   // climbing
 *   ...
 *   else {
 *       prfmsg(NOACCEL,(int)ptr->speed);                        // engines quit
 *       outprfge(ALWAYS,usrn);
 *       ptr->speed2b = 0;
 *   }
 *   ...
 *       if (ptr->speed > 0) prfmsg(WARP,(int)((ptr->speed-decelrate)/1000)+1);
 *       else                prfmsg(DEADSTOP);                    // slowing
 *
 * @see GEFUNCS.C:497-533 (climb + shutdown) and :556-566 (slowing, dead stop)
 *
 * Two defects, not one:
 *
 *  - the WARP ladder was never emitted, so `war 9` from a standstill produced
 *    one acknowledgement and then ~9 ticks of silence;
 *  - the shutdown was silent AND late. Canon's refusal comes from `useenergy`,
 *    which keeps a 500-unit reserve (`if (ptr->energy >= amount+500)`,
 *    GEFUNCS.C:1505), so acceleration cuts out below 620 — not below 120. The
 *    port passed a floor of 0 and let a captain spend into a reserve canon
 *    protects.
 *
 * NOACCEL's `%d` is `(int)ptr->speed` — the RAW speed, not the warp factor.
 * That is canon's own quirk and it is preserved: the event carries raw speed.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import {
  SHIP_ENGINE_SHUTDOWN,
  SHIP_WARP_PROGRESS,
  ShipEngineShutdownEvent,
  ShipWarpProgressEvent,
} from '../../../src/game/physics/speed-events';
import { ACCENGAMT, USEENERGY_RESERVE } from '../../../src/game/constants';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Runner', shpclass: 1, channel: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 65000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: -1,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
  } as ShipState;
}

function harness(ships: ShipState[]) {
  const map = new Map(ships.map((s) => [shipKey(s.userid, s.shipno), s]));
  const shipState = {
    findAllShips: () => [...map.values()],
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n)); if (s) { fn(s); s.dirty = true; } return s;
    },
  } as never;
  const subs: Array<{ k: TickKind; f: (c: TickContext) => void }> = [];
  const tickService = {
    subscribe: (k: TickKind, f: (c: TickContext) => void) => { subs.push({ k, f }); return () => {}; },
  } as never;
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, { maxAcceleration: 2000, maxWarp: 10 });
  const events = new EventEmitter2();
  const warps: ShipWarpProgressEvent[] = [];
  const shutdowns: ShipEngineShutdownEvent[] = [];
  events.on(SHIP_WARP_PROGRESS, (e: ShipWarpProgressEvent) => warps.push(e));
  events.on(SHIP_ENGINE_SHUTDOWN, (e: ShipEngineShutdownEvent) => shutdowns.push(e));
  const svc = new PhysicsTickService(
    tickService, shipState, cache, events, undefined, { next: () => 0.5 },
  );
  svc.onModuleInit();
  let n = 0;
  return {
    warps, shutdowns,
    tick: () => {
      // One canon MOVEMENT STEP is three seconds: warrti2a runs on the
      // 1-second timer and strides the fleet by 3, so each ship rotates,
      // accelerates and moves once per three ticks (GEMAIN.C:2462-2493).
      // Firing three advances every ship exactly once, whichever third it
      // belongs to. This fired once and relied on the ship being first in the
      // list — which stopped being true when the stride moved onto the ship's
      // own channel, as canon's `zothusn` always was.
      for (let i = 0; i < 3; i++) {
        const ctx: TickContext = { kind: TickKind.SHIP_UPDATE, tickNumber: ++n, firedAt: new Date() };
        for (const s of subs) if (s.k === TickKind.SHIP_UPDATE) s.f(ctx);
      }
    },
  };
}

describe('the WARP ladder while climbing (GEFUNCS.C:498)', () => {
  it('reports the new integer warp on a boundary crossing', () => {
    // 900 -> 2900 crosses out of warp 0 and lands in warp 2.
    const ship = makeShip({ speed: 900, speed2b: 9000 });
    const h = harness([ship]);

    h.tick();

    expect(h.warps.map((w) => w.warp)).toEqual([2]);
  });

  it('says nothing on a tick that stays inside one warp factor', () => {
    // 5100 -> 5300 with a slow ship: no integer boundary is crossed.
    const ship = makeShip({ speed: 5100, speed2b: 5300 });
    const h = harness([ship]);

    h.tick();

    expect(h.warps).toHaveLength(0);
  });
});

describe('the WARP ladder while slowing (GEFUNCS.C:558)', () => {
  it('counts down, using canon +1 on the way down', () => {
    // decelrate is 2*max_accel = 4000. 9000 -> 5000 crosses 9 into 5, and canon
    // prints (speed-decelrate)/1000 + 1 = 6 — the factor being LEFT, not entered.
    const ship = makeShip({ speed: 9000, speed2b: 0 });
    const h = harness([ship]);

    h.tick();

    expect(h.warps.map((w) => w.warp)).toEqual([6]);
  });

  /**
   * DEADSTOP is dead code in canon, and this port does not resurrect it.
   *
   * Its branch is the `else` of `if (ptr->speed > 0)` inside the NON-SNAP
   * deceleration arm (GEFUNCS.C:558-568). Reaching it needs `speed <= 0` while
   * `speed > speed2b` — that is, a negative `speed2b`. Canon assigns a negative
   * speed nowhere (`grep -n "speed *= *-" reference/ge-source/*.C` is empty),
   * and GEFUNCS.C:566 is the only `prfmsg(DEADSTOP)` in the source, so the
   * shipped game never printed it either.
   *
   * The dead stop a pilot ACTUALLY sees is the snap to zero, which canon
   * reports with SPEED0 (GEFUNCS.C:551) — already carried by SHIP_SPEED_REPORT.
   *
   * Emitting DEADSTOP on some invented trigger would be a port invention
   * wearing a canon message's name, which is worse than the silence.
   */
  it('reaches zero via the snap, and never invents a DEADSTOP trigger', () => {
    // decelrate is 4000, so 1500 -> 0 is a SNAP, not a crossing: no ladder rung.
    const ship = makeShip({ speed: 1500, speed2b: 0 });
    const h = harness([ship]);

    h.tick();

    expect(ship.speed).toBe(0);
    expect(h.warps).toHaveLength(0);
  });
});

describe('engine shutdown when the flux runs out (GEFUNCS.C:528)', () => {
  it('reports the shutdown and stops the throttle', () => {
    const ship = makeShip({ speed: 3000, speed2b: 9000, energy: ACCENGAMT + 10 });
    const h = harness([ship]);

    h.tick();

    expect(h.shutdowns).toHaveLength(1);
    expect(ship.speed2b).toBe(0);
  });

  it('carries the RAW speed, which is what NOACCEL interpolates', () => {
    const ship = makeShip({ speed: 3000, speed2b: 9000, energy: ACCENGAMT + 10 });
    const h = harness([ship]);

    h.tick();

    expect(h.shutdowns[0].speed).toBe(3000);
  });

  it('cuts out at the 500-unit reserve, not at zero', () => {
    // useenergy refuses unless energy >= amount + 500, so ACCENGAMT + 499
    // is a refusal even though the ship could "afford" the 120 outright.
    const ship = makeShip({ speed: 3000, speed2b: 9000, energy: ACCENGAMT + USEENERGY_RESERVE - 1 });
    const h = harness([ship]);

    h.tick();

    expect(h.shutdowns).toHaveLength(1);
  });

  it('still accelerates with exactly the reserve in hand — the bound is inclusive', () => {
    const ship = makeShip({ speed: 3000, speed2b: 9000, energy: ACCENGAMT + USEENERGY_RESERVE });
    const h = harness([ship]);

    h.tick();

    expect(h.shutdowns).toHaveLength(0);
    expect(ship.speed).toBeGreaterThan(3000);
  });

  it('says nothing while the ship has power', () => {
    const ship = makeShip({ speed: 3000, speed2b: 9000, energy: 65_000 });
    const h = harness([ship]);

    h.tick();

    expect(h.shutdowns).toHaveLength(0);
  });
});
