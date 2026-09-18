/**
 * The four deaths that had no name.
 *
 * #52 taught the manifest to report the WEAPON that landed the killing blow.
 * Everything that kills a ship without a weapon still printed `cause=unknown`,
 * and several of those are ordinary ways to die. Each site below applies damage
 * and, until #54, stamped nothing:
 *
 *   overspeed     ship-tick.service.ts        an overspeed break
 *   teleport      physics-tick.service.ts     telezip, the perimeter wall
 *   wormhole      physics-tick.service.ts     transit damage
 *   neutral-zone  the four weapon handlers    SE100DAM, firing at the origin
 *
 * They are asserted at the STAMP rather than at the manifest: the resolution
 * that turns `deathCause` into `cause` is one line with its own spec, and a
 * test that drove a whole tick engine to reach it would be testing that line
 * four more times instead of testing these four sites.
 *
 * @see test/game/combat/destroyed-manifest-cause.spec.ts — the resolution
 * @see https://github.com/rearley/galactic-empire-reborn/issues/54
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { PLTYPE_WORM, UNIVMAX } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import type { TickService } from '../../../src/game/tick/tick.service';
import type { ShipStateService } from '../../../src/game/ship/ship-state.service';
import type { MaintenanceService } from '../../../src/game/ship/maintenance.service';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  // `head2b` tracks `heading` unless a case says otherwise: a ship whose
  // requested heading differs spends its movement step ROTATING, and a test
  // that forgets this watches a stationary ship and concludes the code is
  // broken. It cost twenty minutes here.
  const heading = over.heading ?? 0;
  return baseMakeShip({
    shipname: 'T', energy: 65000, topspeed: 10, phasrtype: 1, shieldtype: 1,
    heading, head2b: over.head2b ?? heading,
    items: Array(14).fill(0n) as bigint[], ...over,
  });
}

/** Physics harness: one ship, and whatever gravity bodies the case needs. */
function physicsHarness(ship: ShipState, bodies: () => unknown[] = () => []) {
  const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const shipState = {
    findAllShips: () => [...map.values()],
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n)); if (s) { fn(s); s.dirty = true; } return s;
    },
  } as unknown as ShipStateService;
  const subs: Array<{ k: TickKind; f: (c: TickContext) => void }> = [];
  const tickService = {
    subscribe: (k: TickKind, f: (c: TickContext) => void) => { subs.push({ k, f }); return () => {}; },
  } as unknown as TickService;
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, { maxAcceleration: 3000, maxWarp: 10 } as never);
  // Resolved at CALL time, not at setup: the gravity pass reads the ship's
  // live position, so a body fixed at the ship's starting coordinates is
  // thousands of raw units away by the time it is measured.
  const galaxy = { getGravityBodies: () => bodies() } as never;
  const svc = new PhysicsTickService(tickService, shipState, cache, new EventEmitter2(), galaxy);
  svc.onModuleInit();
  return {
    // Three 1s ticks is one canon MOVEMENT step, whichever third the ship is in.
    tick: () => {
      for (let i = 0; i < 3; i++) {
        for (const s of subs) if (s.k === TickKind.SHIP_UPDATE) s.f({ kind: TickKind.SHIP_UPDATE, tickNumber: i + 1, firedAt: new Date() });
      }
    },
  };
}

describe('every death that is not a weapon names itself', () => {
  it('striking the galaxy wall is a teleport death, not an unknown one', () => {
    // telezip: the wall takes your momentum and 17 hull. @see GEFUNCS.C:819 `void  FUNC telezip(ptr,usrn)`
    const ship = makeShip({
      xcoord: UNIVMAX - 0.05, ycoord: 0, heading: 90, speed: 9000, speed2b: 9000, where: 0,
      channel: 0,
    });
    physicsHarness(ship).tick();

    expect(ship.deathCause?.kind).toBe('teleport');
  });

  it('a wormhole transit that kills you names the wormhole', () => {
    const ship = makeShip({ xcoord: 5.5, ycoord: 5.5, speed: 3000, speed2b: 3000, where: 0, status: 1, channel: 0 });
    // `GravityBody` reads GALPLNT.type; anything that is not PLTYPE_PLNT is a
    // wormhole, and a wormhole needs somewhere to come out.
    physicsHarness(ship, () => [
      {
        plnum: 7, xcoord: ship.xcoord, ycoord: ship.ycoord,
        type: PLTYPE_WORM, destination: { xcoord: -3, ycoord: 2 },
      },
    ]).tick();

    expect(ship.deathCause?.kind).toBe('wormhole');
    expect(ship.deathCause?.what).toBe('wormhole 7');
  });

  it('an overspeed break names itself', () => {
    // The break is a dice roll inside decideOverspeed; pin the roll so this
    // asserts the stamp rather than the RNG.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const ship = makeShip({ speed: 9000, speed2b: 9000, topspeed: 1, warncntr: 5, xcoord: 5.5, ycoord: 5.5 });
      const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
      const shipState = {
        findAllShips: () => [...map.values()],
        mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
          const s = map.get(shipKey(u, n)); if (s) fn(s); return s;
        },
      } as unknown as ShipStateService;
      // Kind-aware: ShipTickService subscribes TWICE (the movement tick and the
      // subsystem-restore pass), and a harness that kept only the last handler
      // fires the wrong one.
      const subs: Array<{ k: TickKind; f: (c: TickContext) => void }> = [];
      const tickService = {
        subscribe: (k: TickKind, f: (c: TickContext) => void) => { subs.push({ k, f }); return () => {}; },
      } as unknown as TickService;
      const maint = { runAutoRepair: vi.fn().mockResolvedValue(undefined) } as unknown as MaintenanceService;
      const svc = new ShipTickService(tickService, shipState, maint);
      svc.onModuleInit();
      // The overspeed roll rides canon's stride of three, so six 1-second ticks
      // is two chances. @see GEMAIN.C:2471 `zothusn = clicker;` — warrti2a's stride
      for (let i = 0; i < 6 && ship.deathCause === undefined; i++) {
        const ctx: TickContext = { kind: TickKind.SHIP_UPDATE, tickNumber: i + 1, firedAt: new Date() };
        for (const sub of subs) if (sub.k === TickKind.SHIP_UPDATE) sub.f(ctx);
      }

      expect(ship.deathCause?.kind).toBe('overspeed');
    } finally {
      vi.restoreAllMocks();
    }
  });
});
