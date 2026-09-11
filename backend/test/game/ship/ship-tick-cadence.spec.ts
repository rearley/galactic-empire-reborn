/**
 * Repair, shields, subsystem recovery and energy all run on the 6-second tick.
 *
 * GEMAIN.C:2256-2274 — `warrtia()` calls repairship, shieldstat, shieldchg,
 * cloakstat, checktm, recharge and checkdam, and re-arms itself with
 * `rtkick(TICKTIME, warrti)` where TICKTIME is 6 (GEMAIN.H:133). The 1-second
 * routine `warrti2a` (GEMAIN.C:2470-2495) does only rotate, accelerate, move
 * and the destruct countdown.
 *
 * The port ran the whole restorative block on the 1s tick while applying C's
 * per-call amounts, so hulls healed 18 points per 6 seconds instead of 3 and
 * shot-out helm, tactical, fire control and cloak came back six times sooner.
 * Combat attrition was largely erased.
 *
 * @see GEMAIN.C:2256-2274 warrtia  @see GEFUNCS.C:390 repairship
 */

import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { MaintenanceService } from '../../../src/game/ship/maintenance.service';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import { REPAIRRATE } from '../../../src/game/constants';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';


function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeHarness(ships: ShipState[]) {
  const byKind = new Map<TickKind, (ctx: TickContext) => void>();
  const map = new Map(ships.map((s) => [shipKey(s.userid, s.shipno), s]));

  const tick = {
    subscribe: jest.fn((kind: TickKind, handler: (ctx: TickContext) => void) => {
      byKind.set(kind, handler);
      return jest.fn();
    }),
  } as unknown as TickService;

  const state = {
    findAllShips: () => Array.from(map.values()),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (!s) return undefined;
      fn(s);
      return s;
    },
  } as unknown as ShipStateService;

  const maint = { runAutoRepair: jest.fn().mockResolvedValue(undefined) } as unknown as MaintenanceService;

  const svc = new ShipTickService(tick, state, maint);
  svc.onModuleInit();

  let n = 0;
  return {
    svc,
    fireShipUpdate: () => byKind.get(TickKind.SHIP_UPDATE)?.({ kind: TickKind.SHIP_UPDATE, tickNumber: ++n, firedAt: new Date() }),
    firePhysics: () => byKind.get(TickKind.PHYSICS)?.({ kind: TickKind.PHYSICS, tickNumber: ++n, firedAt: new Date() }),
    subscribedKinds: () => Array.from(byKind.keys()),
  };
}

describe('the restorative block is driven by the 6s physics tick', () => {
  it('subscribes to the physics tick', () => {
    const h = makeHarness([makeShip()]);
    expect(h.subscribedKinds()).toContain(TickKind.PHYSICS);
  });

  it('repairs 3 hull points per 6-second tick, not per second', () => {
    const ship = makeShip({ damage: 30, repair: 10 });
    const h = makeHarness([ship]);

    h.fireShipUpdate();
    expect(ship.damage).toBe(30); // the 1s tick does not repair

    h.firePhysics();
    // 3 from the queued repair, then REPAIRRATE from checkdam's passive heal,
    // which canon runs on the same pass (GEMAIN.C:2257 then :2267).
    expect(ship.damage).toBeCloseTo(30 - 3 - REPAIRRATE, 10);
  });

  it('recovers a shot-out subsystem one point per 6-second tick', () => {
    const ship = makeShip({ helm: -5, tactical: -5 });
    const h = makeHarness([ship]);

    h.fireShipUpdate();
    h.fireShipUpdate();
    h.fireShipUpdate();
    expect(ship.helm).toBe(-5);

    h.firePhysics();
    expect(ship.helm).toBe(-4);
    expect(ship.tactical).toBe(-4);
  });

  it('charges shields once per 6-second tick', () => {
    const ship = makeShip({ shieldstat: 1, shieldtype: 3, shield: 0, energy: 50000 });
    const h = makeHarness([ship]);

    h.fireShipUpdate();
    expect(ship.shield).toBe(0);

    h.firePhysics();
    expect(ship.shield).toBe(9); // shieldtype * 3
  });
});
