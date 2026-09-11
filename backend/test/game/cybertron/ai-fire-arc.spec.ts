/**
 * An AI phaser discharge sweeps the ARC, not a single target.
 *
 * Canon has one `firep` and it loops the whole ship table (GECMDS.C:946-1004):
 *
 *   for (othusn=0 ; othusn < nships ; othusn++)
 *       if (ingegame(othusn) && (wptr->where != 1 || ptr->phasrtype >= phatowrp))
 *           if (othusn != usrn && !neutral(&wptr->coord))
 *               if (smallest(heading,deg) < ptr->percent+PHABIAS)   ... hit it
 *
 * `ingegame()` is TRUE for GESTAT_AUTO, so in the original a Cybertron's shot
 * hits every ship inside the cone — bystanders and other AI included. The
 * player's handler implements that faithfully; the AI path was a separate
 * single-target reimplementation, so an AI could never hit anything except the
 * one hull it had picked. That split had already forced the same gate to be
 * fixed twice (the hyperspace check landed on the player path first), which is
 * the argument for one shared selection rather than two.
 *
 * Canon also makes a hit on an AI retarget it: `if (wptr->status == GESTAT_AUTO)
 * wptr->cybmine = usrn` (GECMDS.C:980-981). That is what turns stray AI fire
 * into an actual fight instead of silent chip damage.
 *
 * @see GECMDS.C:946-1004 firep
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, PHATOWRP } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

const CYB_CLASS = 21;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'u',
    shipname: 'S',
    energy: 50_000,
    phasrtype: 5,
    percent: 99,
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
  const events = new EventEmitter2();
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
    scanRange: 400_000, maxTons: 1_000, hasTorpedo: true, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, hasCloak: false,
    hasDecoy: false, noClaim: 1, tough: 1, cybLowestClassAttacks: 0,
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

  const repository = {
    hydrateAll: jest.fn().mockResolvedValue(undefined),
    createSpawn: jest.fn(),
    flushShipsImmediate: jest.fn().mockResolvedValue(undefined),
    flushUsersImmediate: jest.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => n,
  } as unknown as CybertronRepository;

  const tickService = { subscribe: () => () => {} } as unknown as TickService;

  const svc = new CybertronTickService(
    tickService, shipState, shipClassCache, repository, events,
    new Mulberry32Adapter(42),
  );

  const fire = (attacker: ShipState, target: ShipState) =>
    (svc as unknown as {
      cybFirePhaser: (s: ShipState, t: ShipState, c: unknown) => void;
    }).cybFirePhaser(attacker, target, {
      kind: 'PHYSICS', firedAt: new Date('2026-09-04T12:00:00Z'), seq: 1,
    });

  return { shipState, fire };
}

describe('AI phaser fire sweeps the arc (GECMDS.C:946)', () => {
  /**
   * Attacker at (5,5) heading 0. The port's bearing is `atan2(dx, -dy)`, so
   * heading 0 points toward DECREASING y — victims go below the attacker.
   */
  function scenario() {
    const { shipState, fire } = buildHarness();
    const cyb = makeShip({
      userid: 'Cybrg-1', shipno: 1, shipname: 'Cybrg-1', channel: 1,
      shpclass: CYB_CLASS, status: 2, phasr: 500, phasrtype: 5,
      xcoord: 5, ycoord: 5, heading: 0, percent: 99,
    });
    // Both dead ahead, inside the cone and inside scan range.
    const primary = makeShip({
      userid: 'p1', shipno: 2, shipname: 'Primary', channel: 2,
      xcoord: 5, ycoord: 4.8, status: 1,
    });
    const bystander = makeShip({
      userid: 'p2', shipno: 3, shipname: 'Bystander', channel: 3,
      xcoord: 5, ycoord: 4.7, status: 1,
    });
    shipState.loadShip(cyb);
    shipState.loadShip(primary);
    shipState.loadShip(bystander);
    return { cyb, primary, bystander, fire };
  }

  it('damages a bystander standing in the same cone', () => {
    const { cyb, primary, bystander, fire } = scenario();

    fire(cyb, primary);

    expect(primary.damage).toBeGreaterThan(0);
    expect(bystander.damage).toBeGreaterThan(0);
  });

  it('hits another AI ship in the arc — ingegame() is true for GESTAT_AUTO', () => {
    const { cyb, primary, bystander, fire } = scenario();
    bystander.status = 2;

    fire(cyb, primary);

    expect(bystander.damage).toBeGreaterThan(0);
  });

  it('makes an AI it hits turn on it — cybmine = usrn', () => {
    const { cyb, primary, bystander, fire } = scenario();
    // GESTAT_AUTO is what marks an AI hull. (Do not reassign userid here — the
    // state map is keyed on it, so a rename after loadShip orphans the ship.)
    bystander.status = 2;
    bystander.cybmine = 255;

    fire(cyb, primary);

    expect(bystander.cybmine).toBe(cyb.channel);
  });

  it('never shoots itself, whatever the geometry', () => {
    const { cyb, primary, fire } = scenario();
    fire(cyb, primary);
    expect(cyb.damage).toBe(0);
  });

  /**
   * The hyperspace gate moved into the shared selection when the two firep
   * copies were merged, so it is pinned here by behaviour rather than by the
   * old text-match on `aiCanHitTarget(`.
   * @see GECMDS.C:949 `wptr->where != 1 || ptr->phasrtype >= phatowrp`
   */
  it('cannot touch a victim in hyperspace with a below-threshold phaser', () => {
    const { cyb, primary, bystander, fire } = scenario();
    cyb.phasrtype = PHATOWRP - 1;
    bystander.where = 1;

    fire(cyb, primary);

    expect(primary.damage).toBeGreaterThan(0);
    expect(bystander.damage).toBe(0);
  });

  it('reaches the same victim once the phaser is at the threshold', () => {
    const { cyb, primary, bystander, fire } = scenario();
    cyb.phasrtype = PHATOWRP;
    bystander.where = 1;

    fire(cyb, primary);

    expect(bystander.damage).toBeGreaterThan(0);
  });

  it('spares a ship outside the cone', () => {
    const { shipState, fire } = buildHarness();
    const cyb = makeShip({
      userid: 'Cybrg-1', shipno: 1, shipname: 'Cybrg-1', channel: 1,
      shpclass: CYB_CLASS, status: 2, phasr: 500, phasrtype: 5,
      xcoord: 5, ycoord: 5, heading: 0, percent: 5,
    });
    const primary = makeShip({
      userid: 'p1', shipno: 2, shipname: 'Primary', channel: 2,
      xcoord: 5, ycoord: 4.8, status: 1,
    });
    // Directly astern — 180 degrees off the firing bearing.
    const behind = makeShip({
      userid: 'p2', shipno: 3, shipname: 'Behind', channel: 3,
      xcoord: 5, ycoord: 5.2, status: 1,
    });
    shipState.loadShip(cyb);
    shipState.loadShip(primary);
    shipState.loadShip(behind);

    fire(cyb, primary);

    expect(behind.damage).toBe(0);
  });
});
