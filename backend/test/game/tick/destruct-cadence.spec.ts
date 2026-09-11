/**
 * The self-destruct countdown runs on the MOVEMENT cadence, not the 6-second one.
 *
 * Canon calls it from `warrti2a`, in the same strided loop as rotate/accel/move:
 *
 *   rotateship(wptr,zothusn); accel(wptr,zothusn);
 *   moveship(wptr,zothusn);   destruct(wptr,zothusn);
 *
 * @see GEMAIN.C:2476-2483 — 1-second timer, stride of 3, so once per 3s per ship
 *
 * `cloakstat` is the contrast: canon runs THAT from `warrtia`, the 6-second
 * timer (GEFUNCS.C:1366), and it stays there. The two live in the same service
 * in this port but belong to different clocks, which is exactly the kind of
 * detail that gets lost when a service is moved wholesale.
 *
 * Left on the 6-second tick the countdown took twice as long as canon to reach
 * zero — a ship set to blow in 20 ticks took two minutes instead of one.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipManagementTickService } from '../../../src/game/commands/ship-management-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'u',
    shipname: 'Doomed',
    xcoord: 20,
    ycoord: 20,
    energy: 50_000,
    phasrtype: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 10,
    ...over,
  });
}

function harness(ships: ShipState[]) {
  const map = new Map<string, ShipState>();
  for (const s of ships) map.set(shipKey(s.userid, s.shipno), s);
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    removeFromGame: (s: { userid: string; shipno: number }) => map.delete(shipKey(s.userid, s.shipno)),
  } as unknown as ShipStateService;

  const subs: Array<{ kind: TickKind; fn: (c: TickContext) => void }> = [];
  const tickService = {
    subscribe: (kind: TickKind, fn: (c: TickContext) => void) => { subs.push({ kind, fn }); return () => {}; },
  } as unknown as TickService;

  const svc = new ShipManagementTickService(
    shipState, tickService, new EventEmitter2(), 50,
  );
  svc.onModuleInit();

  let n = 0;
  const fireKind = (kind: TickKind) => {
    const ctx = { kind, tickNumber: ++n, firedAt: new Date() } as TickContext;
    for (const s of subs) if (s.kind === kind) s.fn(ctx);
  };
  return { subs, second: () => fireKind(TickKind.SHIP_UPDATE), sixSecond: () => fireKind(TickKind.PHYSICS) };
}

describe('self-destruct countdown cadence (GEMAIN.C:2476-2483)', () => {
  it('subscribes the countdown to the 1-second timer', () => {
    const { subs } = harness([makeShip({ destruct: 20 })]);

    expect(subs.map((s) => s.kind)).toContain(TickKind.SHIP_UPDATE);
  });

  it('counts down once per three seconds, matching movement', () => {
    const ship = makeShip({ destruct: 20 });
    const { second } = harness([ship]);

    second(); second(); second();

    expect(ship.destruct).toBe(19);
  });

  it('does not count down on the 6-second tick, where cloak lives', () => {
    const ship = makeShip({ destruct: 20 });
    const { sixSecond } = harness([ship]);

    sixSecond();

    expect(ship.destruct).toBe(20);
  });
});
