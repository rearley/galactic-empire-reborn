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
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

const CLOAK_COST = 7500;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'BigCat II',
    shpclass: 8,
    xcoord: 5,
    ycoord: 5,
    energy: ENGYMAX,
    shieldtype: 7,
    cloak: CLOAK_RAMP_FULL,
    items: Array(14).fill(0n) as bigint[],
    ...over,
  });
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
  // NOTE: this is the NARROW case — a tick that STARTS below ENGYMIN with the
  // cloak already on, reachable by engaging the cloak on a nearly empty tank
  // (`clo on` debits CLENGUSE immediately). It is NOT the steady-state drain
  // path: a cloaked ship draining normally dies in the 5,000-8,199 band long
  // before it reaches the reload threshold, because shieldstat runs before
  // cloakstat and takes its cut first. @see docs/PROGRESS.md 2026-09-10
  it('reloads before the cloak test when a tick starts under the threshold', () => {
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
