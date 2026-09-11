/**
 * Canon hulls heal on their own, slowly, on every physics tick.
 *
 * `checkdam` ends with `if (ptr->damage > 0.0) ptr->damage -= repairrate;`
 * (GEFUNCS.C:1009-1010), and warrtia calls it for every ship on the TICKTIME
 * pass (GEMAIN.C:2267). `repairrate` is REPAIRRT/100 (GEMAIN.C:514-515),
 * shipped at 6, so 0.06 damage a tick.
 *
 * The port had no repairrate at all: damage only ever fell inside the queued
 * repair that `mai` buys. A round-3 persona finished a fight at 98% hull with
 * 2,503 credits and no reachable depot, and in canon that pilot recovers by
 * flying; here they were finished.
 */
import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { REPAIRRATE } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';


function makeShipState(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function harness(ships: ShipState[]) {
  const map = new Map(ships.map((s) => [`${s.userid}:${s.shipno}`, s]));
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = map.get(`${userid}:${shipno}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
  } as never;

  const subs: Array<{ kind: TickKind; fn: (c: TickContext) => void }> = [];
  const tickService = {
    subscribe: (kind: TickKind, fn: (c: TickContext) => void) => {
      subs.push({ kind, fn });
      return () => {};
    },
  } as never;

  const svc = new ShipTickService(tickService, shipState, {} as never);
  svc.onModuleInit();

  let n = 0;
  const physicsTick = () => {
    const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: ++n, firedAt: new Date() };
    for (const s of subs) if (s.kind === TickKind.PHYSICS) s.fn(ctx);
  };
  return { physicsTick };
}

describe('passive hull repair — GEFUNCS.C:1009-1010 checkdam', () => {
  it('sheds repairrate damage on every physics tick', () => {
    const ship = makeShipState({ damage: 50, repair: 0, cantexit: 0 });
    const h = harness([ship]);

    h.physicsTick();
    expect(ship.damage).toBeCloseTo(50 - REPAIRRATE, 10);

    for (let i = 0; i < 9; i++) h.physicsTick();
    expect(ship.damage).toBeCloseTo(50 - REPAIRRATE * 10, 10);
  });

  it('never drives damage below zero', () => {
    const ship = makeShipState({ damage: REPAIRRATE / 2, repair: 0, cantexit: 0 });
    const h = harness([ship]);
    h.physicsTick();
    expect(ship.damage).toBe(0);
    h.physicsTick();
    expect(ship.damage).toBe(0);
  });

  it('leaves an undamaged hull alone', () => {
    const ship = makeShipState({ damage: 0, repair: 0 });
    const h = harness([ship]);
    h.physicsTick();
    expect(ship.damage).toBe(0);
  });

  it('heals a ship that is still locked in combat', () => {
    // checkdam's subtraction sits outside every combat guard — only the QUEUED
    // repair (repairship, GEFUNCS.C:397) is interrupted by cantexit.
    const ship = makeShipState({ damage: 30, repair: 0, cantexit: 8 });
    const h = harness([ship]);
    h.physicsTick();
    expect(ship.damage).toBeCloseTo(30 - REPAIRRATE, 10);
  });
});
