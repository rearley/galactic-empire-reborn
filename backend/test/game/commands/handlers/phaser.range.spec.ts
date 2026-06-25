import { EventEmitter2 } from '@nestjs/event-emitter';
import { CommandContext } from '../../../../src/game/commands/command.types';
import { PhaserHandlerService } from '../../../../src/game/commands/handlers/phaser.handler';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { Mulberry32Adapter } from '../../../../src/game/combat/random.port';
import {
  COMBAT_HIT,
  COMBAT_MISS,
} from '../../../../src/game/combat/combat-events';

/**
 * Regression: phaser handler MUST gate candidate victims by the firer's
 * scan range. This mirrors the C source which iterates all ships but where
 * pdamage() falls to zero outside `disfact = 20000 + phasrtype*4000`
 * (cdistance × 10000 units). In TS we approximate the same "no shot beyond
 * scanner" rule by gating with scanRange — the same gate every other
 * weapon and lock command already uses (see find-ship.ts).
 *
 * Audit 022 finding C-001 — "shot from across the map" bug.
 *
 * @see GECMDS.C:946-1004 firep
 * @see GEFUNCS.C:2060-2092 pdamage
 * @see specs/022-fidelity-audit-v2/findings.md C-001
 */
function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

function makeHarness(ships: ShipState[], scanRange: number): {
  handler: PhaserHandlerService;
  emitted: Array<{ event: string; payload: unknown }>;
} {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (u: string, n: number) => shipMap.get(shipKey(u, n)),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(u, n));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
  } as unknown as ShipStateService;

  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, {
    maxAcceleration: 1000,
    maxWarp: 10,
    maxPhaser: 1000,
    scanRange,
    maxTons: 5000,
  } as never);

  const events = new EventEmitter2();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  events.onAny((event: string | string[], payload: unknown) => {
    const ev = Array.isArray(event) ? event.join('.') : event;
    emitted.push({ event: ev, payload });
  });

  const handler = new PhaserHandlerService(
    shipState,
    cache,
    events,
    new Mulberry32Adapter(42),
  );
  return { handler, emitted };
}

const ctx: CommandContext = {};

describe('PhaserHandlerService — C-001 range gate', () => {
  // These tests isolate the scanRange gate from the phaser DAMAGE-falloff
  // curve. A normal phaser (phasrtype 1) drops to zero damage at ~2.4 sectors
  // (disfact = 20000 + 1*4000 = 24000 raw units), well inside a 10-sector scan
  // range — so to prove the *scan-range* boundary specifically, we mount the
  // sysop phaser (phasrtype 20), which deals a flat 101 damage at ANY distance.
  // That way the only thing that can stop a hit is the scanRange gate itself.
  // Firing direction: degree 90 relative to heading 0 ⇒ absolute east.
  it('does not hit a target outside scanRange (cdistance × 10000 > scanRange)', () => {
    // scanRange = 100000 ⇒ 10 sectors. Target at 20 sectors east.
    const firer = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 5, heading: 0, phasrtype: 20 });
    const farTarget = makeShip({
      userid: 'u2', shipno: 2, shipname: 'Far',
      xcoord: 20, ycoord: 5, status: 1,
    });
    const { handler, emitted } = makeHarness([firer, farTarget], 100000);

    handler.command.handler(firer, ['90', '0'], ctx);

    const hits = emitted.filter((e) => e.event === COMBAT_HIT);
    const misses = emitted.filter((e) => e.event === COMBAT_MISS);
    expect(hits).toHaveLength(0);
    expect(misses).toHaveLength(1);
  });

  it('still hits a target inside scanRange at the same bearing', () => {
    // 5 sectors east = cdistance 5 → 50000 units (well within 100000 scan range).
    const firer = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 5, heading: 0, phasrtype: 20 });
    const nearTarget = makeShip({
      userid: 'u3', shipno: 3, shipname: 'Near',
      xcoord: 5, ycoord: 5, status: 1,
    });
    const { handler, emitted } = makeHarness([firer, nearTarget], 100000);

    handler.command.handler(firer, ['90', '0'], ctx);

    const hits = emitted.filter((e) => e.event === COMBAT_HIT);
    expect(hits).toHaveLength(1);
  });

  it('does not hit a target exactly at the scan-range boundary (strict >)', () => {
    // scanRange = 100000 ⇒ exactly 10 sectors. cdistance*10000 must be STRICTLY
    // less than scanRange to count, matching find-ship.ts: `dist*10000 > scanRange`
    // is the rejection threshold.
    const firer = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 5, heading: 0, phasrtype: 20 });
    const boundary = makeShip({
      userid: 'u4', shipno: 4, shipname: 'Boundary',
      xcoord: 10.001, ycoord: 5, status: 1,
    });
    const { handler, emitted } = makeHarness([firer, boundary], 100000);

    handler.command.handler(firer, ['90', '0'], ctx);

    const hits = emitted.filter((e) => e.event === COMBAT_HIT);
    expect(hits).toHaveLength(0);
  });
});
