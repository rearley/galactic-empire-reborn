/**
 * A Cybertron chasing you through hyperspace fires the HYPER-phaser.
 *
 *   if (ptr->where == 1 && wptr->where == 1 && gebemean(ptr,zothusn)) {
 *       if (ddist < (tooclose+rndm(tooclose)) || cybs_can_att
 *           || wptr->cantexit > 0 || ptr->cantexit > 0) {
 *           if (ddist < 30000.0) {
 *               ptr->degrees = cbearing(...);
 *               firehp(ptr,usrn);
 *           }
 *       }
 *   }
 *
 * @see GECYBS.C:268-280
 *
 * The port called its normal-phaser sweep here instead. `firep` skips any
 * victim at warp unless `phasrtype >= phatowrp` (GECMDS.C:948), so in practice
 * a Cybertron pursuing a player through hyperspace could never land a shot: no
 * damage, no shield drain, nothing. It closed, it matched course, and it was
 * harmless.
 *
 * firehp differs from firep in three ways that matter here (GECMDS.C:1050-1083):
 *   - a FIXED 5-degree beam (HPBEAMW), so `percent` is irrelevant;
 *   - damage `pdamage * phasrtype / tonfact`, not firep's `(1+phasrtype)/2.5`;
 *   - the damage goes STRAIGHT TO HULL — firehp never calls shieldhit.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import { canonMaxWarp } from '../../helpers/canon-max-warp';
import { AiWeapons } from '../../../src/game/ai/ai-weapons';

const CYB_CLASS = 21;
/** `where === 1` is hyperspace. */
const HYPER = 1;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'u',
    shipname: 'S',
    speed: 25_000,
    speed2b: 25_000,
    xcoord: 20,
    ycoord: 20,
    energy: 500_000,
    phasr: 500,
    phasrtype: 5,
    where: HYPER,
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
    topspeed: canonMaxWarp(CYB_CLASS),
    channel: over.channel ?? over.shipno ?? 1,
    ...over,
  });
}

function harness(ships: ShipState[]) {
  const map = new Map<string, ShipState>();
  for (const s of ships) map.set(shipKey(s.userid, s.shipno), s);
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    get: (u: string, n: number) => map.get(shipKey(u, n)),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => map.set(shipKey(s.userid, s.shipno), s),
    removeFromGame: (s: { userid: string; shipno: number }) => map.delete(shipKey(s.userid, s.shipno)),
    size: () => map.size,
  } as unknown as ShipStateService;

  const entry = {
    maxAcceleration: 5000, maxWarp: 30, maxPhaser: 10, maxShields: 10,
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
    getScanRange: () => entry.scanRange,
    getHasMissile: () => false,
  } as unknown as ShipClassCacheService;

  const svc = new CybertronTickService(
    { subscribe: () => () => {} } as unknown as TickService,
    shipState, shipClassCache,
    {
      hydrateAll: vi.fn().mockResolvedValue(undefined),
      createSpawn: vi.fn(),
      flushShipsImmediate: vi.fn().mockResolvedValue(undefined),
      flushUsersImmediate: vi.fn().mockResolvedValue(undefined),
      clampCybertronCash: (n: bigint) => n,
    } as unknown as CybertronRepository,
    new EventEmitter2(),
    new Mulberry32Adapter(42),
  );

  const ctx = { kind: 'PHYSICS', firedAt: new Date('2026-09-06T12:00:00Z'), seq: 1 };
  const fireHyper = (a: ShipState, t: ShipState) =>
    (svc as unknown as { weapons: AiWeapons }).weapons.firehp(a, t, ctx as never);
  return { fireHyper };
}

function engagement(over: Partial<ShipState> = {}) {
  const cyb = makeShip({
    userid: 'Cybrg-1', shipno: 1, shipname: 'Cybrg-1', channel: 1,
    shpclass: CYB_CLASS, status: 2, where: HYPER,
    xcoord: 20, ycoord: 20, heading: 0, degrees: 90, percent: 0,
  });
  const prey = makeShip({
    userid: 'p1', shipno: 2, shipname: 'Prey', channel: 2, status: 1,
    where: HYPER, xcoord: 20.2, ycoord: 20, ...over,
  });
  return { cyb, prey, ...harness([cyb, prey]) };
}

describe('Cybertron hyper-phaser in hyperspace (GECYBS.C:268-280)', () => {
  it('damages a player it is chasing through hyperspace', () => {
    const { fireHyper, cyb, prey } = engagement();

    fireHyper(cyb, prey);

    expect(prey.damage).toBeGreaterThan(0);
  });

  it('bypasses shields entirely — firehp never calls shieldhit', () => {
    const { fireHyper, cyb, prey } = engagement({ shieldstat: 1, shieldtype: 5, shield: 30 });

    fireHyper(cyb, prey);

    expect({ damage: prey.damage > 0, shield: prey.shield }).toEqual({ damage: true, shield: 30 });
  });

  it('uses the fixed 5-degree beam, so focus is irrelevant', () => {
    // percent 0 would collapse firep's cone; HPBEAMW does not depend on it.
    const { fireHyper, cyb, prey } = engagement();

    fireHyper(cyb, prey);

    expect(prey.damage).toBeGreaterThan(0);
  });

  it('claims the victim, so the fight continues', () => {
    const { fireHyper, cyb, prey } = engagement();

    fireHyper(cyb, prey);

    expect(prey.cantexit).toBeGreaterThan(0);
  });

  it('does not reach a target that is NOT in hyperspace', () => {
    // canon's branch requires `wptr->where == 1` as well as the firer's.
    const { fireHyper, cyb, prey } = engagement({ where: 0, speed: 0 });

    fireHyper(cyb, prey);

    expect(prey.damage).toBe(0);
  });
});
