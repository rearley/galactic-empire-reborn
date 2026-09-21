/**
 * Each AI house rule, on and off: on is what production does, off is canon.
 * @see src/game/ai/house-rules.ts, issue #63
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CANON_RULES, PORT_RULES, type AiHouseRules } from '../../../src/game/ai/house-rules';
import { Mulberry32Adapter, type Random } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { buildCybertronClassConfigs } from '../../../src/game/cybertron/cybertron.config';
import { CANON_TOT_TO_CREATE, scaleAiPopulation } from '../../../src/game/cybertron/cyb-population';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { COMBAT_SHIP_DESTROYED } from '../../../src/game/combat/combat-events';
import { UNIVMAX, DROID_CLASS_VAKORY } from '../../../src/game/constants';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip } from '../../helpers/make-ship';

function cybHarness(ships: ShipState[], rules: AiHouseRules) {
  const map = new Map(ships.map((s) => [`${s.userid}:${s.shipno}`, s]));
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    findByUserid: () => [],
    get: (u: string, n: number) => map.get(`${u}:${n}`),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => { const s = map.get(`${u}:${n}`); if (s) fn(s); return s; },
    loadShip: (s: ShipState) => map.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: vi.fn(),
  } as unknown as ShipStateService;
  const classes = {
    get: () => ({
      maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2, scanRange: 500_000, maxTons: 900,
      hasTorpedo: false, hasMissile: false, hasJammer: false, hasMine: false, hasZipper: false,
      noClaim: 3, tough: 0, cybLowestClassAttacks: 1,
    }),
    getCategory: () => 'CPU_COMBATIVE',
    getMaxTons: () => 900,
  } as unknown as ShipClassCacheService;
  const events = new EventEmitter2();
  const svc = new CybertronTickService(
    { subscribe: () => () => undefined } as unknown as TickService,
    shipState, classes,
    {
      hydrateAll: vi.fn().mockResolvedValue(undefined),
      createSpawn: vi.fn().mockResolvedValue(undefined),
      flushShipsImmediate: vi.fn().mockResolvedValue(undefined),
    } as unknown as CybertronRepository,
    events, new Mulberry32Adapter(7),
    undefined, undefined, undefined, undefined, undefined, rules,
  );
  return { svc, events };
}

const brainOf = (svc: CybertronTickService) =>
  (svc as unknown as { brain: { cybCheckLockon(s: ShipState, top: number, c: unknown): void } }).brain;

describe('zoneSanctuary', () => {
  const cyb = () => makeShip({ userid: 'Cybrg-205', shipno: 205, shpclass: 21, status: 2, xcoord: 3.5, ycoord: 3.5, cybmine: 255, holdcourse: 0, topspeed: 8 });
  const hubPilot = () => makeShip({ userid: 'p1', shipno: 1, status: 1, channel: 4, shpclass: 3, xcoord: 0.5, ycoord: 0.5 });

  it('on (the port): a pilot on the hub cannot be claimed', () => {
    const c = cyb();
    const { svc } = cybHarness([c, hubPilot()], PORT_RULES);
    brainOf(svc).cybCheckLockon(c, 8000, { firedAt: new Date(0) });
    expect(c.cybmine).toBe(255);
  });

  // Canon's scan has no neutral test: GECYBS.C:709 `if (ptr->cybmine == (byte)255)` and the loop below it.
  it('off (canon): a pilot on the hub is claimed like anyone else', () => {
    const c = cyb();
    const { svc } = cybHarness([c, hubPilot()], CANON_RULES);
    brainOf(svc).cybCheckLockon(c, 8000, { firedAt: new Date(0) });
    expect(c.cybmine).toBe(4);
  });
});

describe('respawnHold', () => {
  const kill = (events: EventEmitter2) =>
    events.emit(COMBAT_SHIP_DESTROYED, { victimUserid: 'Cybrg-205', victimClass: 21 });
  const held = (svc: CybertronTickService) => (svc as unknown as { isHeld(n: number): boolean }).isHeld(21);

  it('on (the port): a killed class is held', async () => {
    const { svc, events } = cybHarness([], PORT_RULES);
    await svc.onModuleInit();
    kill(events);
    expect(held(svc)).toBe(true);
  });

  it('off (canon): nothing is held — canon refills whatever slot it examines next', async () => {
    const { svc, events } = cybHarness([], CANON_RULES);
    await svc.onModuleInit();
    kill(events);
    expect(held(svc)).toBe(false);
  });
});

describe('scalePopulation', () => {
  it('on (the port): counts scale with the galaxy we deploy', () => {
    expect(buildCybertronClassConfigs(PORT_RULES)[21].tot_to_create).toBe(scaleAiPopulation(CANON_TOT_TO_CREATE[21], UNIVMAX));
  });

  it('off (canon): canon\'s own counts', () => {
    const cfg = buildCybertronClassConfigs(CANON_RULES);
    for (const [cls, n] of Object.entries(CANON_TOT_TO_CREATE)) expect(cfg[Number(cls)].tot_to_create).toBe(n);
  });
});

describe('droidsSpawnOutsideZone', () => {
  /**
   * 0.5 rolls coordinate 0.15, inside sector (0,0); 0.9 rolls one well outside.
   * The first ten draws cover the name and the first coordinate pair, so the
   * first spawn lands in the hub; any re-roll after that lands outside.
   */
  const rng = (): Random => { let i = 0; return { next: () => (i++ < 10 ? 0.5 : 0.9) }; };
  const spawnWith = (rules: AiHouseRules): ShipState => {
    const map = new Map<string, ShipState>();
    const shipState = { findAllShips: () => Array.from(map.values()), loadShip: (s: ShipState) => map.set(s.userid, s) } as unknown as ShipStateService;
    const classes = { get: () => ({ shipNameTemplate: 'Vakory ', maxPhaser: 1, maxShields: 1, maxWarp: 4 }), getMaxShields: () => 1, getMaxPhaser: () => 1 } as unknown as ShipClassCacheService;
    return new DroidSpawner(shipState, classes, rng(), rules).spawn(DROID_CLASS_VAKORY, new Map())!;
  };

  it('on (the port): a spawn that lands in the hub is re-rolled', () => {
    const d = spawnWith(PORT_RULES);
    expect(Math.floor(d.xcoord) === 0 && Math.floor(d.ycoord) === 0).toBe(false);
  });

  // Canon places droids anywhere: GEDROIDS.C:131 `if (univmax < 20)` and its two arms.
  it('off (canon): it stays where it landed', () => {
    const d = spawnWith(CANON_RULES);
    expect(Math.floor(d.xcoord)).toBe(0);
    expect(Math.floor(d.ycoord)).toBe(0);
  });
});
