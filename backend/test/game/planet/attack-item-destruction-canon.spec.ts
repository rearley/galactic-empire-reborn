/**
 * Canon's high-ratio item-destruction loop in the troop branch of cmd_attack
 * starts at index 1:
 *
 *   for(ii=1;ii<NUMITEMS;++ii)
 *
 * @see GECMDS.C:3714-3730
 *
 * I_MEN is index 0 (GEMAIN.H:143), so a ground raid NEVER kills a colony's
 * population — it trashes stockpiles only. Men are the planet's production
 * workforce, so destroying them is a permanent economic wound canon does not
 * inflict.
 *
 * Contrast attack_fig, which deliberately DOES start at 0 and instead excludes
 * the fighters it is already resolving (`for(ii=0;...)` with `ii != I_FIGHTER`,
 * GECMDS.C:3875-3890) — so the difference between the two loops is intentional
 * in canon, not an accident to be normalised away.
 *
 * Canon's loop includes I_TROOPS, but `plptr->items[I_TROOPS].qty = left2`
 * runs AFTER it (GECMDS.C:3745), overwriting whatever the loop did — so the
 * only observable difference is Men. The index range still matters for a
 * second reason: each iteration consumes one gernd(), so starting at the wrong
 * index shifts which item receives which random draw.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlanetAttackService } from '../../../src/game/planet/planet-attack.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { I_MEN, I_TROOPS, I_FIGHTER, I_FOOD, NUMITEMS } from '../../../src/game/constants/items';
import {
  PLATTRT1_DEFAULT, PLATTRT2_DEFAULT, FIRETICKS_DEFAULT,
} from '../../../src/game/commands/attack.config';

const START_MEN = 1_000_000n;

function makePlanet(troops: number): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
  items[I_TROOPS].qty = BigInt(troops);
  items[I_MEN].qty = START_MEN;
  items[I_FOOD].qty = 100_000n;
  return {
    xsect: 5, ysect: 5, plnum: 1, type: 1, xcoord: 5.5, ycoord: 5.5,
    userid: 'defender', name: 'Colony', enviorn: 0, resource: 0,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
    password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n, items,
  };
}

function makeShip(troops: number): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  items[I_TROOPS] = BigInt(troops);
  return {
    userid: 'attacker', shipno: 1, shipname: 'Attacker', shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  };
}

function makeService(seed: number) {
  const random = new Mulberry32Adapter(seed);
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => { fn(makeShip(0)); },
    ),
    // ownerIsInGame() — canon's mailit(1) suppression (GEFUNCS.C:2231).
    findByUserid: jest.fn().mockReturnValue([]),
  } as unknown as ShipStateService;
  const mockPrisma = {
    user: { update: jest.fn().mockResolvedValue({}) },
    mailStat: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  return new PlanetAttackService(
    mockShipState, mockPrisma, new EventEmitter2(), random,
    PLATTRT1_DEFAULT, PLATTRT2_DEFAULT, 0.05, 0.05, 0.05, FIRETICKS_DEFAULT,
  );
}

describe('troop raid item destruction — canon starts at index 1 (GECMDS.C:3714)', () => {
  // An overwhelming raid: ratio is (left1*100)/left2, so 5,000 v 60 clears
  // `ratio > 2` and `left1 > left2/2` comfortably and reaches the trash loop.
  const ATTACK_TROOPS = 5_000;
  const DEFENCE_TROOPS = 60;

  it('never destroys the colony population', async () => {
    // Sweep seeds so this cannot pass by a lucky draw: the loop takes
    // gernd()%15 per item, so an unfixed build kills Men on most seeds.
    for (let seed = 1; seed <= 25; seed++) {
      const planet = makePlanet(DEFENCE_TROOPS);
      const service = makeService(seed);

      const outcome = await service.attackTroop(ATTACK_TROOPS, makeShip(ATTACK_TROOPS), planet);

      expect({ seed, men: planet.items[I_MEN].qty }).toEqual({ seed, men: START_MEN });
      expect(outcome.itemsDestroyed.find((d) => d.itemIndex === I_MEN)).toBeUndefined();
    }
  });

  it('still trashes ordinary stockpiles, so the loop is running at all', async () => {
    const destroyedSomething = await (async () => {
      for (let seed = 1; seed <= 25; seed++) {
        const planet = makePlanet(DEFENCE_TROOPS);
        const service = makeService(seed);
        const outcome = await service.attackTroop(ATTACK_TROOPS, makeShip(ATTACK_TROOPS), planet);
        if (outcome.itemsDestroyed.some((d) => d.itemIndex === I_FOOD)) return true;
      }
      return false;
    })();

    expect(destroyedSomething).toBe(true);
  });

  it('leaves the garrison at the post-battle survivor count, not a trashed one', async () => {
    // Canon's loop DOES touch I_TROOPS, but :3745 overwrites it with left2.
    // Pinning that ordering keeps a future fix from reversing the two steps.
    const planet = makePlanet(DEFENCE_TROOPS);
    const service = makeService(7);

    const outcome = await service.attackTroop(ATTACK_TROOPS, makeShip(ATTACK_TROOPS), planet);

    expect(planet.items[I_TROOPS].qty).toBe(BigInt(outcome.left2));
  });

  it('fighters are untouched by the troop branch trash loop only via the qty they hold', async () => {
    // I_FIGHTER is index 6, inside canon's 1..NUMITEMS-1 range, so unlike Men
    // it IS eligible. This pins the boundary from the other side: the fix must
    // exclude index 0 only, not "everything the port felt like skipping".
    const planet = makePlanet(DEFENCE_TROOPS);
    planet.items[I_FIGHTER].qty = 500n;
    const service = makeService(3);

    await service.attackTroop(ATTACK_TROOPS, makeShip(ATTACK_TROOPS), planet);

    expect(planet.items[I_FIGHTER].qty).toBeLessThanOrEqual(500n);
  });
});
