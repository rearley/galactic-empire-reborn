/**
 * A cloaked ship reloads a flux pod BEFORE its cloak is tested for power.
 *
 * Canon's `warrtia` is one function and its order is the whole mechanism
 * (GEMAIN.C:2256-2259): `fluxstat` runs first and reloads a pod when energy
 * drops under ENGYMIN, so `cloakstat` — four calls later — sees a full tank
 * instead of an empty one.
 *
 * This port split those two across services and registered both through a Set,
 * so the sequence was whatever order Nest happened to construct them in. It
 * came out backwards, and a player found it rather than the suite:
 *
 *   cloak 7,500/tick + Mark-7 shields 700/tick from a full 65,000 tank
 *     -> zero after eight ticks
 *     -> cloak tested first, "shut down due to lack of power"
 *     -> flux fires, refills to 65,000
 *     -> shields take 700, recharge adds 1
 *     -> ship observed at 64,301 with fifteen pods and no cloak
 *
 * That 64,301 is what makes it provable rather than a hunch: it is exactly
 * what the wrong order predicts, to the unit.
 *
 * These cases drive the two services through a real TickService so the
 * ORDERING is what is under test. Calling them directly in the right sequence
 * would pass on the broken build and prove nothing.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import { TickOrder } from '../../../src/game/tick/tick-order';
import { InvariantRegistry } from '../../../src/game/invariants/harness';
import { ShipManagementTickService } from '../../../src/game/commands/ship-management-tick.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { CLOAK_RAMP_FULL } from '../../../src/game/commands/_ship-management-constants';
import { ENGYMIN, ENGYMAX } from '../../../src/game/constants';
import { I_FLUX } from '../../../src/game/constants/items';

const CLOAK_COST = 7500;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'BigCat II', shpclass: 8,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: ENGYMAX,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 7, shieldstat: 0, shield: 0, cloak: CLOAK_RAMP_FULL,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
  } as ShipState;
}

function harness(ship: ShipState) {
  const tick = new TickService({ runAll: () => [] } as unknown as InvariantRegistry);
  const shipState = {
    findAllShips: () => [ship],
    mutate: (_u: string, _n: number, fn: (s: ShipState) => void) => { fn(ship); return ship; },
  } as unknown as ShipStateService;

  // Stand-in for ShipTickService's restorative pass: the ONLY part under test
  // is that whatever holds TickOrder.FLUX runs before the cloak upkeep.
  tick.subscribe(TickKind.PHYSICS, () => {
    if (ship.energy < ENGYMIN && (ship.items[I_FLUX] ?? 0n) > 0n) {
      ship.energy = ENGYMAX;
      ship.items[I_FLUX] = (ship.items[I_FLUX] ?? 0n) - 1n;
    }
  }, TickOrder.FLUX);

  const mgmt = new ShipManagementTickService(
    shipState, tick, new EventEmitter2(), CLOAK_COST,
  );
  mgmt.onModuleInit();
  return { tick, ship };
}

function runTicks(tick: TickService, n: number): void {
  for (let i = 0; i < n; i++) {
    (tick as unknown as { fire: (k: TickKind) => void }).fire(TickKind.PHYSICS);
  }
}

describe('flux reloads before the cloak is tested (warrtia order)', () => {
  it('keeps a cloak alive on a reloaded pod instead of shutting it down', () => {
    const ship = makeShip({ energy: 1000 });
    ship.items[I_FLUX] = 15n;
    const { tick } = harness(ship);

    runTicks(tick, 1);

    expect(ship.cloak).toBe(CLOAK_RAMP_FULL);       // still hidden
    expect(ship.items[I_FLUX]).toBe(14n);           // a pod was spent
    expect(ship.energy).toBe(ENGYMAX - CLOAK_COST); // and the cloak drew from it
  });

  it('still shuts the cloak down when there is no pod to reload', () => {
    const ship = makeShip({ energy: 1000 });
    ship.items[I_FLUX] = 0n;
    const { tick } = harness(ship);

    runTicks(tick, 1);

    expect(ship.cloak).toBe(0);
  });

  /**
   * The dead band, pinned because it is canon and it surprises everyone.
   *
   * ENGYMAX 65,000 divided by CLENGUSE 7,500 leaves exactly 5,000, and
   * ENGYMIN is 5,000. `fluxstat` tests `energy < ENGYMIN`, strictly less, so a
   * ship cloaking from a full tank with NOTHING else drawing power lands one
   * unit above the reload threshold and the cloak dies with a full hold.
   *
   * Any other drain — shields, movement — pushes it under and the reload
   * catches it, which is why cloaking while moving sustains itself and
   * cloaking while parked does not. Both constants are canon and so is the
   * gap between them; this is not a bug to fix, it is a rule to keep.
   */
  it('cloak alone from a full tank lands ON the threshold and is not rescued', () => {
    const ship = makeShip({ energy: ENGYMAX });
    ship.items[I_FLUX] = 5n;
    const { tick } = harness(ship);

    runTicks(tick, 8);
    expect(ship.energy).toBe(ENGYMIN);          // 65,000 - 8 x 7,500
    expect(ship.cloak).toBe(CLOAK_RAMP_FULL);   // still up, just
    expect(ship.items[I_FLUX]).toBe(5n);        // nothing spent

    runTicks(tick, 1);
    expect(ship.cloak).toBe(0);                 // 5,000 < 7,500, and 5,000 is
    expect(ship.items[I_FLUX]).toBe(5n);        // NOT < 5,000, so no reload
  });
});
