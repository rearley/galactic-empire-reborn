/**
 * A completed repair restores the whole ship, `topspeed` included.
 *
 * GEFUNCS.C:406-421 — when `repair` falls to 1 or below:
 *
 *   repair = 0; damage = 0.0; phasr = 100;
 *   tactical = 0; helm = 0; firecntl = 0;
 *   shieldstat = SHIELDDN; shield = 0;
 *   topspeed = shipclass[shpclass].max_warp;
 *
 * The port restored only the first three. That made blowing your engines by
 * overspeeding permanent: `ship-overspeed.ts` sets `topspeed = 0`, `warp`
 * refuses on it, and paying for `maint` never gave it back — the only path was
 * the boot-time self-heal in ShipStateService. A pilot could be left unable to
 * warp for the rest of the session with no in-game way to fix it.
 */

import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { MaintenanceService } from '../../../src/game/ship/maintenance.service';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 50000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeHarness(ships: ShipState[]) {
  const byKind = new Map<TickKind, (ctx: TickContext) => void>();
  const map = new Map(ships.map((s) => [shipKey(s.userid, s.shipno), s]));
  const tick = {
    subscribe: vi.fn((kind: TickKind, handler: (ctx: TickContext) => void) => {
      byKind.set(kind, handler);
      return vi.fn();
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
  const maint = { runAutoRepair: vi.fn().mockResolvedValue(undefined) } as unknown as MaintenanceService;
  const svc = new ShipTickService(tick, state, maint);
  svc.onModuleInit();
  let n = 0;
  return {
    firePhysics: () =>
      byKind.get(TickKind.PHYSICS)?.({ kind: TickKind.PHYSICS, tickNumber: ++n, firedAt: new Date() }),
  };
}

describe('repair completion — GEFUNCS.C:406-421', () => {
  it('restores topspeed to the class maximum', () => {
    // Engines blown by overspeeding: topspeed 0, warp refused.
    const ship = makeShip({ damage: 3, repair: 1, topspeed: 0, maxWarp: 9 });
    makeHarness([ship]).firePhysics();
    expect(ship.repair).toBe(0);
    expect(ship.damage).toBe(0);
    expect(ship.topspeed).toBe(9);
  });

  it('clears the shot-out subsystems and drops shields', () => {
    const ship = makeShip({
      damage: 3, repair: 1, topspeed: 0, maxWarp: 9,
      tactical: -8, helm: -8, firecntl: 5, shieldstat: 1, shield: 70, phasr: -20,
    });
    makeHarness([ship]).firePhysics();
    expect(ship.tactical).toBe(0);
    expect(ship.helm).toBe(0);
    expect(ship.firecntl).toBe(0);
    expect(ship.shieldstat).toBe(0);
    expect(ship.shield).toBe(0);
    expect(ship.phasr).toBe(100);
  });

  it('leaves topspeed alone while the repair is still in progress', () => {
    const ship = makeShip({ damage: 30, repair: 10, topspeed: 0, maxWarp: 9 });
    makeHarness([ship]).firePhysics();
    expect(ship.repair).toBeGreaterThan(0);
    expect(ship.topspeed).toBe(0);
  });
});
