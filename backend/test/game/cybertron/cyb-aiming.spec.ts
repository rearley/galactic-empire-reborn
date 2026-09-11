/**
 * A Cybertron AIMS before it fires. Canon assigns the relative bearing to
 * `degrees` immediately before every discharge, in both engagement branches:
 *
 *   ptr->degrees = (int)(cbearing(&ptr->coord,&wptr->coord,ptr->heading)+.5);
 *   firehp(ptr,usrn);                                   // hyperspace, :276-277
 *
 *   ptr->degrees = (int)(cbearing(&ptr->coord,&wptr->coord,ptr->heading)+.5);
 *   ptr->percent = 2;                                   // normal space, :281-282
 *   ... cyb_attack(ptr,usrn,wptr,zothusn);
 *
 * @see GECYBS.C:263-284
 *
 * `firep` sweeps the cone around `heading + degrees` (GECMDS.C:946-1004), so a
 * Cybertron that never sets `degrees` fires straight down its hull facing and
 * connects only when the target happens to drift into the nose — which is why
 * this matters: during a turning fight the AI was shooting at empty space.
 *
 * `percent` is the half-width of that cone. Canon sets it to 2 in the
 * normal-space branch only; the hyperspace branch calls firehp, which uses its
 * own fixed HPBEAMW and ignores percent.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

const CYB_CLASS = 21;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'u',
    shipname: 'S',
    energy: 50_000,
    phasrtype: 5,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    cybmine: 255,
    cybskill: 10,
    cybupdate: 50,
    tick: 1,
    topspeed: 8_000,
    channel: over.channel ?? over.shipno ?? 1,
    ...over,
  });
}

function buildHarness() {
  const shipMap = new Map<string, ShipState>();
  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (u: string, n: number) => shipMap.get(`${u}:${n}`),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${u}:${n}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: (s: { userid: string; shipno: number }) => shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
  } as unknown as ShipStateService;

  const entry = {
    maxAcceleration: 5000, maxWarp: 20, maxPhaser: 10, maxShields: 10,
    scanRange: 400_000, maxTons: 1_000, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, hasCloak: false,
    hasDecoy: false, noClaim: 1, tough: 0, cybLowestClassAttacks: 0,
    cybCanAttack: true, points: 1, canAttackPlanet: false, damageFactor: 100,
    typeName: 'T', category: 'CPU_COMBATIVE', shipNameTemplate: '',
  };
  const shipClassCache = {
    get: () => entry,
    getCategory: () => 'CPU_COMBATIVE',
    getMaxPhaser: () => entry.maxPhaser,
    getMaxTons: () => entry.maxTons,
    getDamageFactor: () => entry.damageFactor,
    getHasMissile: () => false,
  } as unknown as ShipClassCacheService;

  const svc = new CybertronTickService(
    { subscribe: () => () => {} } as unknown as TickService,
    shipState, shipClassCache,
    {
      hydrateAll: jest.fn().mockResolvedValue(undefined),
      createSpawn: jest.fn(),
      flushShipsImmediate: jest.fn().mockResolvedValue(undefined),
      flushUsersImmediate: jest.fn().mockResolvedValue(undefined),
      clampCybertronCash: (n: bigint) => n,
    } as unknown as CybertronRepository,
    new EventEmitter2(),
    new Mulberry32Adapter(42),
  );

  const ctx = { kind: 'PHYSICS', firedAt: new Date('2026-09-06T12:00:00Z'), seq: 1 };
  const fire = (a: ShipState, t: ShipState) =>
    (svc as unknown as { cybFirePhaser: (s: ShipState, t: ShipState, c: unknown) => void })
      .cybFirePhaser(a, t, ctx);
  const attack = (a: ShipState, t: ShipState, ddist: number) =>
    (svc as unknown as {
      cybAttack: (s: ShipState, t: ShipState, tough: number, d: number, c: unknown) => void;
    }).cybAttack(a, t, 0, ddist, ctx);

  return { shipState, fire, attack };
}

/**
 * Attacker well clear of sector (0,0) heading 0 — `firep` refuses to fire in
 * the neutral zone (`!neutral(&wptr->coord)`, GECMDS.C:952), so a scenario at
 * the origin proves nothing about aiming. The port's bearing is `atan2(dx, -dy)`, so
 * heading 0 points toward DECREASING y. A target at +x, same y therefore sits
 * on the beam of a ship that has turned 90 degrees to starboard — i.e. exactly
 * off the bow, unreachable without aiming.
 */
function scenario() {
  const h = buildHarness();
  const cyb = makeShip({
    userid: 'Cybrg-1', shipno: 1, shipname: 'Cybrg-1', channel: 1,
    shpclass: CYB_CLASS, status: 2, phasr: 500, phasrtype: 5,
    xcoord: 20, ycoord: 20, heading: 0, degrees: 0, percent: 0,
  });
  const victim = makeShip({
    userid: 'p1', shipno: 2, shipname: 'Victim', channel: 2,
    xcoord: 20.2, ycoord: 20, status: 1,
  });
  h.shipState.loadShip(cyb);
  h.shipState.loadShip(victim);
  return { ...h, cyb, victim };
}

describe('Cybertron aiming (GECYBS.C:276-282)', () => {
  it('aims at a target 90 degrees off the bow instead of firing down the hull facing', () => {
    const { fire, cyb, victim } = scenario();

    fire(cyb, victim);

    expect(victim.damage).toBeGreaterThan(0);
  });

  it('records the relative bearing in `degrees`, as canon does before each shot', () => {
    const { fire, cyb, victim } = scenario();

    fire(cyb, victim);

    // cbearing(from, to, heading) is relative and signed -180..180.
    expect(cyb.degrees).toBe(90);
  });

  it('normal-space engagement narrows the cone to canon focus 2', () => {
    const { attack, cyb, victim } = scenario();

    attack(cyb, victim, 1_000);

    expect(cyb.percent).toBe(2);
  });

  it('does not fire on a target behind it once aimed', () => {
    // With aiming in place the cone must still be a cone: a ship at the same
    // bearing but 180 degrees opposite is not a target.
    const { fire, cyb, shipState } = scenario();
    const behind = makeShip({
      userid: 'p2', shipno: 3, shipname: 'Behind', channel: 3,
      xcoord: 19.8, ycoord: 20, status: 1,
    });
    shipState.loadShip(behind);
    const target = makeShip({
      userid: 'p1', shipno: 2, shipname: 'Victim', channel: 2,
      xcoord: 20.2, ycoord: 20, status: 1,
    });

    fire(cyb, target);

    expect(behind.damage).toBe(0);
  });
});
