/**
 * A ship must never be permanently stranded.
 *
 * C's 6-second `warrtia` runs two energy routines the port had neither of:
 *
 *   recharge()  GEFUNCS.C:1290-1300 — `if (energy < ENGYMAX) energy += ENGRECHG`
 *   fluxstat()  GEFUNCS.C:1307-1330 — below ENGYMIN, auto-consume a flux pod
 *                                     and refill to ENGYMAX
 *
 * Without them, energy only ever went down outside the manual `flux` command,
 * so a pilot could sit at zero with a hold full of pods and no way to spend
 * them. Together with deceleration being charged (see
 * deceleration-is-free.spec.ts), running dry at warp was unrecoverable.
 *
 * `shieldstat()` (GEFUNCS.C:1336-1352) is the other half: raised shields are
 * debited at the TOP of shieldchg, before the charge test, and collapse
 * outright below SHMINPWR. The port nested the debit inside the charge test,
 * so a shield sitting at full charge cost nothing to hold up.
 */

import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { MaintenanceService } from '../../../src/game/ship/maintenance.service';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { ENGRECHG, ENGYMAX, ENGYMIN, SHMINPWR, SHENGUSE } from '../../../src/game/constants';
import { I_FLUX } from '../../../src/game/constants/items';


function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
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
  const maint = {} as unknown as MaintenanceService;
  const svc = new ShipTickService(tick, state, maint);
  svc.onModuleInit();
  let n = 0;
  return {
    firePhysics: () =>
      byKind.get(TickKind.PHYSICS)?.({ kind: TickKind.PHYSICS, tickNumber: ++n, firedAt: new Date() }),
  };
}

describe('passive recharge — GEFUNCS.C:1290-1300', () => {
  it('adds ENGRECHG each 6-second tick', () => {
    const ship = makeShip({ energy: 20000 });
    makeHarness([ship]).firePhysics();
    expect(ship.energy).toBe(20000 + ENGRECHG);
  });

  it('does not exceed ENGYMAX', () => {
    const ship = makeShip({ energy: ENGYMAX });
    makeHarness([ship]).firePhysics();
    expect(ship.energy).toBe(ENGYMAX);
  });

  it('lifts a ship off zero, so being stranded is never permanent', () => {
    const ship = makeShip({ energy: 0 });
    makeHarness([ship]).firePhysics();
    expect(ship.energy).toBeGreaterThan(0);
  });
});

describe('auto-flux — GEFUNCS.C:1307-1330', () => {
  it('burns a pod and refills to ENGYMAX below ENGYMIN', () => {
    const items = Array(14).fill(0n) as bigint[];
    items[I_FLUX] = 3n;
    const ship = makeShip({ energy: ENGYMIN - 1, items });
    makeHarness([ship]).firePhysics();
    expect(ship.energy).toBe(ENGYMAX);
    expect(ship.items[I_FLUX]).toBe(2n);
  });

  it('does nothing at or above ENGYMIN', () => {
    const items = Array(14).fill(0n) as bigint[];
    items[I_FLUX] = 3n;
    const ship = makeShip({ energy: ENGYMIN, items });
    makeHarness([ship]).firePhysics();
    expect(ship.items[I_FLUX]).toBe(3n);
  });

  it('does nothing with no pods aboard', () => {
    const ship = makeShip({ energy: 100 });
    makeHarness([ship]).firePhysics();
    expect(ship.energy).toBeLessThan(ENGYMIN);
  });
});

describe('holding shields up costs power — GEFUNCS.C:1336-1352, 2497-2499', () => {
  it('debits type*SHENGUSE even when the shield is already at full charge', () => {
    const shieldtype = 3;
    const maxCharge = 40 + shieldtype * 10;
    const ship = makeShip({ shieldstat: 1, shieldtype, shield: maxCharge, energy: 50000 });
    makeHarness([ship]).firePhysics();
    // recharge() also runs, so account for ENGRECHG.
    expect(ship.energy).toBe(50000 - shieldtype * SHENGUSE + ENGRECHG);
  });

  it('leaves the collapse below SHMINPWR to the service that narrates it', () => {
    // The COLLAPSE is ShipManagementTickService.shieldPowerTick's, because it
    // is the one that emits SHDNNOP. This service used to drop them silently
    // as well, and whichever ran first won.
    // @see test/game/ship/shield-power-collapse.spec.ts
    const ship = makeShip({ shieldstat: 1, shieldtype: 3, shield: 60, energy: SHMINPWR - 1 });
    makeHarness([ship]).firePhysics();
    expect(ship.shieldstat).toBe(1);
    expect(ship.shield).toBe(60);
  });
});
