/**
 * The warp shake must actually destroy the missile, not just announce it.
 *
 * Round-4 playtest, found by reading both sides: the shake zeroes
 * `lmisslDistance[i]` and leaves `lmisslChannel[i]` set. But
 * `processIncomingMissiles` gates each slot on the CHANNEL, so the slot is
 * still walked; `newDist = 0 - MISLSPED` is negative, falls past the
 * `newDist > 0` branch, and detonates at the full stored charge.
 *
 * Net effect: MISSL2 prints "the missile has lost lockon and self destructed",
 * the lock clears from `rep wpns` — and the missile hits you one tick later.
 * A cosmetic fix that makes the game LIE to the player is worse than no fix.
 *
 * Canon's walk is guarded on DISTANCE, not the channel:
 *   `for (i=0,mptr=ptr->lmissl;i<MAXMISSL;++i,++mptr) if (mptr->distance > 0)`
 * (GEFUNCS.C:1611-1613), which is exactly why zeroing distance kills it there.
 * Both halves are fixed: the walk guards on distance as canon does, and the
 * shake frees the whole slot.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
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

function shakeHarness(ship: ShipState) {
  const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const shipState = {
    findAllShips: () => [...map.values()],
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n)); if (s) { fn(s); s.dirty = true; } return s;
    },
  } as never;
  const subs: Array<{ k: TickKind; f: (c: TickContext) => void }> = [];
  const tickService = { subscribe: (k: TickKind, f: (c: TickContext) => void) => { subs.push({ k, f }); return () => {}; } } as never;
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, { maxAcceleration: 2000, maxWarp: 10 });
  const svc = new PhysicsTickService(
    tickService, shipState, cache, new EventEmitter2(), undefined,
    { next: () => 0 }, // gernd()%4 === 0 -> threshold warp 4
  );
  svc.onModuleInit();
  let n = 0;
  return () => {
    // One canon MOVEMENT STEP is three seconds: warrti2a runs on the 1-second
    // timer and strides the fleet by 3 (GEMAIN.C:2462-2493). Firing three
    // advances every ship exactly once, whichever third it belongs to.
    for (let i = 0; i < 3; i++) {
      const ctx: TickContext = { kind: TickKind.SHIP_UPDATE, tickNumber: ++n, firedAt: new Date() };
      for (const s of subs) if (s.k === TickKind.SHIP_UPDATE) s.f(ctx);
    }
  };
}

describe('missile shake frees the slot, not just the distance', () => {
  it('clears the CHANNEL too, so the missile is really gone', () => {
    // 3900 -> 5900 crosses warp 3 into warp 5; threshold 4.
    const ship = makeShip({
      speed: 3900, speed2b: 9000,
      lmisslChannel: [7, 8], lmisslDistance: [4000, 2500], lmisslEnergy: [30000, 30000],
    });
    shakeHarness(ship)();

    expect(ship.lmisslDistance).toEqual([0, 0]);
    // This is the half that was missing. Leaving the channel set means
    // processIncomingMissiles still walks the slot and detonates it.
    expect(ship.lmisslChannel).toEqual([255, 255]);
    expect(ship.lmisslEnergy).toEqual([0, 0]);
  });

  it('leaves a missile that did NOT meet the threshold fully intact', () => {
    const ship = makeShip({
      speed: 3900, speed2b: 9000,
      lmisslChannel: [7], lmisslDistance: [4000], lmisslEnergy: [30000],
    });
    // Threshold 7: gernd()%4 === 3, and gernd is floor(next * 65536).
    const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
    const shipState = {
      findAllShips: () => [...map.values()],
      mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
        const s = map.get(shipKey(u, n)); if (s) fn(s); return s;
      },
    } as never;
    const subs: Array<{ k: TickKind; f: (c: TickContext) => void }> = [];
    const tickService = { subscribe: (k: TickKind, f: (c: TickContext) => void) => { subs.push({ k, f }); return () => {}; } } as never;
    const cache = new ShipClassCacheService({} as never);
    cache.setForTest(1, { maxAcceleration: 2000, maxWarp: 10 });
    const svc = new PhysicsTickService(
      tickService, shipState, cache, new EventEmitter2(), undefined, { next: () => 3 / 65536 },
    );
    svc.onModuleInit();
    for (let i = 0; i < 3; i++) {
      for (const s of subs) if (s.k === TickKind.SHIP_UPDATE) s.f({ kind: TickKind.SHIP_UPDATE, tickNumber: i + 1, firedAt: new Date() });
    }

    expect(ship.lmisslChannel).toEqual([7]);
    expect(ship.lmisslDistance).toEqual([4000]);
  });
});
