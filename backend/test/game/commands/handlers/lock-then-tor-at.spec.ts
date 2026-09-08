/**
 * Reproduces the playtest bug: `loc <name>` confirms, then `tor @` says
 * "No target locked." Wires LockHandlerService and TorpedoHandlerService
 * against a shared mock ShipStateService so the lock mutation made by `loc`
 * must be observable to `tor @`.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { LockHandlerService } from '../../../../src/game/commands/handlers/lock.handler';
import { TorpedoHandlerService } from '../../../../src/game/commands/handlers/torpedo.handler';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { Mulberry32Adapter } from '../../../../src/game/combat/random.port';
import { I_TORP } from '../../../../src/game/constants/items';
import { NOLOCK_SENTINEL } from '../../../../src/game/commands/helpers/find-ship';

function itemsWith(map: Record<number, bigint>): bigint[] {
  const arr: bigint[] = [];
  for (let i = 0; i < 14; i++) arr.push(0n);
  for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
  return arr;
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Self', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50_000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 1, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: itemsWith({ [I_TORP]: 5n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: NOLOCK_SENTINEL, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

const ctx: CommandContext = {};

describe('lock → tor @ integration', () => {
  it('player locks an AI droid, then tor @ resolves the locked target', () => {
    // Positioned well off the neutral-zone origin (0,0) — firing in the NZ now
    // self-zaps the firer. Target is 0.5 sectors away → inside torpedo lock range.
    const alice = makeShip({ userid: 'alice', shipno: 1, shipname: 'Alice', xcoord: 10, ycoord: 7 });
    const droid = makeShip({
      userid: '@Droid-1', shipno: 1, shipname: 'Murdonian',
      shpclass: 11, status: 2, xcoord: 10.5, ycoord: 7,
    });

    const shipMap = new Map<string, ShipState>([
      [shipKey(alice.userid, alice.shipno), alice],
      [shipKey(droid.userid, droid.shipno), droid],
    ]);

    const shipState = {
      findAllShips: () => Array.from(shipMap.values()),
      get: (uid: string, sn: number) => shipMap.get(shipKey(uid, sn)),
      mutate: (uid: string, sn: number, fn: (s: ShipState) => void) => {
        const s = shipMap.get(shipKey(uid, sn));
        if (!s) return undefined;
        fn(s);
        s.dirty = true;
        return s;
      },
    } as unknown as ShipStateService;

    const cache = new ShipClassCacheService({} as never);
    cache.setForTest(1, {
      maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
      scanRange: 100_000_000, maxTons: 5000, hasTorpedo: true, hasMissile: true,
    } as never);
    cache.setForTest(11, {
      maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
      scanRange: 100_000_000, maxTons: 5000, hasTorpedo: true, hasMissile: true,
    } as never);

    const lock = new LockHandlerService(shipState, cache,
      { lettersFor: () => [] } as unknown as ScanHandlerService,
    );
    const torp = new TorpedoHandlerService(shipState, cache, new EventEmitter2(), new Mulberry32Adapter(1),
      { lettersFor: () => [] } as unknown as ScanHandlerService,
    );

    // 1) loc Murdonian
    const lockRes = lock.command.handler(alice, ['Murdonian'], ctx) as CommandResult;
    expect(lockRes.lines[0].text).toMatch(/Fire control locked on Murdonian commanded by/);
    expect(alice.lock).toBe(droid.shipno);

    // 2) tor @ — must succeed with the same locked target
    const torRes = torp.command.handler(alice, ['@'], ctx) as CommandResult;
    expect(torRes.lines[0].text).not.toMatch(/No target locked/i);
    // Firing drops shields first and says so, so this is no longer lines[0].
    // Canon's TFIRE1 — "Torpedoes fired sir!" It does not name the target;
    // ours did, and that was invented. @see MBMGEMSG.MSG TFIRE1
    expect(torRes.lines.some((l) => /Torpedoes fired sir!/.test(l.text))).toBe(true);
  });
});
