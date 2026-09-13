/**
 * `fireion` runs for every ship on each 6-second pass (GEMAIN.C:2265), and it
 * is the sole consumer of `hostile`.
 *
 * A pilot who attacks a planet is marked hostile toward it
 * (`warsptr->hostile = warsptr->where`, GECMDS.C:3568). While that mark
 * stands and the planet holds ion cannons, the planet shoots back every tick.
 * Pull more than 1000 raw units away and `checkdist` (GEFUNCS.C:907-930)
 * clears the mark.
 *
 * The port had the mark and the clearing but no gun: ion cannons were a
 * tradeable item with no effect and there was no reason to garrison a colony.
 */

import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { MaintenanceService } from '../../../src/game/ship/maintenance.service';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_ION } from '../../../src/game/constants/items';
import { IDAMMAX } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 4.5,
    ycoord: -6.5,
    energy: 50000,
    phasrtype: 1,
    lastfired: 7,
    shieldtype: 1,
    where: 12,
    items: Array(NUMITEMS).fill(0n) as bigint[],
    hostile: 12,
    lock: -1,
    topspeed: 10,
    ...over,
  });
}

function makeHarness(ship: ShipState, ionQty: bigint, planetAt = { x: 4.5, y: -6.5 }) {
  const byKind = new Map<TickKind, (ctx: TickContext) => void>();
  const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const emitted: unknown[] = [];

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

  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
  items[I_ION].qty = ionQty;

  const planets = {
    get: (xsect: number, ysect: number, plnum: number) =>
      plnum === 2 ? ({ xsect, ysect, plnum, xcoord: planetAt.x, ycoord: planetAt.y, items } as never) : undefined,
  } as unknown as PlanetStateService;

  const maint = { runAutoRepair: vi.fn().mockResolvedValue(undefined) } as unknown as MaintenanceService;
  const events = { emit: (e: string, p: unknown) => { emitted.push({ e, p }); } } as never;

  const svc = new ShipTickService(tick, state, maint, planets, events);
  svc.onModuleInit();
  let n = 0;
  return {
    emitted,
    fire: () => byKind.get(TickKind.PHYSICS)?.({ kind: TickKind.PHYSICS, tickNumber: ++n, firedAt: new Date() }),
  };
}

describe('fireion — a planet you attacked shoots back', () => {
  it('hits a bare hull hard', () => {
    const ship = makeShip({ shieldstat: 0 });
    makeHarness(ship, 25n).fire();
    expect(ship.damage).toBeGreaterThanOrEqual(IDAMMAX * 0.5);
  });

  it('is mostly absorbed by raised shields', () => {
    const ship = makeShip({ shieldstat: 1, shield: 200, shieldtype: 1 });
    makeHarness(ship, 25n).fire();
    expect(ship.damage).toBeLessThan(IDAMMAX * 0.15);
    expect(ship.shield).toBeLessThan(200);
  });

  it('clears kill credit — a planet kill belongs to nobody', () => {
    const ship = makeShip({ lastfired: 7 });
    makeHarness(ship, 25n).fire();
    expect(ship.lastfired).toBe(-1);
  });

  it('does nothing when the planet holds no ion cannons', () => {
    const ship = makeShip();
    makeHarness(ship, 0n).fire();
    expect(ship.damage).toBe(0);
    expect(ship.lastfired).toBe(7);
  });

  it('does nothing to a pilot who never attacked', () => {
    const ship = makeShip({ hostile: 0 });
    makeHarness(ship, 25n).fire();
    expect(ship.damage).toBe(0);
  });

  it('announces the hit so the pilot knows what is shooting', () => {
    const ship = makeShip();
    const h = makeHarness(ship, 25n);
    h.fire();
    expect(h.emitted.length).toBeGreaterThan(0);
  });
});

describe('checkdist — pulling away ends the engagement', () => {
  it('clears hostile beyond 1000 raw units of the planet', () => {
    // 0.2 sectors = 2000 raw units.
    const ship = makeShip({ xcoord: 4.7, ycoord: -6.5 });
    makeHarness(ship, 25n, { x: 4.5, y: -6.5 }).fire();
    expect(ship.hostile).toBe(0);
    expect(ship.damage).toBe(0);
  });

  it('keeps you marked while you stay close', () => {
    // 0.05 sectors = 500 raw units, inside the 1000 threshold.
    const ship = makeShip({ xcoord: 4.55, ycoord: -6.5 });
    makeHarness(ship, 25n, { x: 4.5, y: -6.5 }).fire();
    expect(ship.hostile).toBe(12);
    expect(ship.damage).toBeGreaterThan(0);
  });
});
