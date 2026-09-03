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


function makeShipState(overrides: Partial<ShipState> = {}): ShipState {
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
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
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
