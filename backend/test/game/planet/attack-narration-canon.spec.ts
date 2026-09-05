/**
 * The words a planetary assault reports, and the order it reports them in.
 *
 * The resolvers' arithmetic was already pinned (attack-troop-math,
 * attack-fighter-math), but the narration was only ever asserted non-empty. It
 * was therefore free to say anything, and it did:
 *
 *   - ATTACKM2 reads "our troops killed %s, and suffered losses of %s" and
 *     canon passes kill2 before kill1 (GECMDS.C:3693). The port passed kill1
 *     first, so every ground battle reported its casualties INVERTED — you
 *     read your own dead as the enemy's.
 *   - The port announced defender fighter kills and ground kills on their own
 *     invented lines, then reported the same casualties again in the summary.
 *   - "troops have returned to the ship" printed even when none survived.
 *   - Nothing at all said whether you had taken the planet: canon closes on
 *     ATTACK8 or ATTACK9 from cmd_attack, and neither existed here.
 *
 * These assert the SHAPE of the transcript against canon's prfmsg order rather
 * than exact numbers, which the math specs already own.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlanetAttackService } from '../../../src/game/planet/planet-attack.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { I_TROOPS, I_FIGHTER, NUMITEMS } from '../../../src/game/constants/items';
import { CANON_MESSAGES } from '../../../src/game/commands/canon-messages.generated';
import {
  PLATTRT1_DEFAULT, PLATTRT2_DEFAULT, FIRETICKS_DEFAULT,
} from '../../../src/game/commands/attack.config';

function makeItems(): PlanetState['items'] {
  return Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
}

function makePlanet(troops: number, fighters = 0): PlanetState {
  const items = makeItems();
  items[I_TROOPS].qty = BigInt(troops);
  items[I_FIGHTER].qty = BigInt(fighters);
  return {
    xsect: 5, ysect: 5, plnum: 0, type: 1, xcoord: 5.5, ycoord: 5.5,
    userid: 'defender', name: 'TestPlanet', enviorn: 0, resource: 0,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
    password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n, items,
  };
}

function makeShip(): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  items[I_TROOPS] = 5000n;
  items[I_FIGHTER] = 5000n;
  return {
    userid: 'attacker', shipno: 1, shipname: 'Attacker', shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0, where: 10,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  };
}

function makeService(seed: number) {
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_u: string, _n: number, fn: (s: ShipState) => void) => fn(makeShip()),
    ),
  } as unknown as ShipStateService;
  const mockPrisma = {
    user: { update: jest.fn().mockResolvedValue({}) },
    mailStat: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  return new PlanetAttackService(
    mockShipState, mockPrisma, new EventEmitter2(), new Mulberry32Adapter(seed),
    PLATTRT1_DEFAULT, PLATTRT2_DEFAULT, 0.05, 0.05, 0.05, FIRETICKS_DEFAULT,
  );
}

/** The literal text of a canon id with its %-specifiers stripped, for matching. */
function stem(id: keyof typeof CANON_MESSAGES): string {
  return CANON_MESSAGES[id].split(/%[sdulc]/)[0].replace(/\\n/g, '\n').trim();
}

describe('troop assault narration follows canon', () => {
  it('opens on ATTACKM1, the landing itself', async () => {
    const out = await makeService(11).attackTroop(300, makeShip(), makePlanet(200));
    expect(out.narration[0]).toContain(stem('ATTACKM1'));
  });

  it('reports the enemy dead FIRST and our losses second, as ATTACKM2 is worded', async () => {
    // The regression that motivated this file. ATTACKM2's two %s are, in
    // order, kill2 then kill1 — the port had them reversed.
    const out = await makeService(11).attackTroop(300, makeShip(), makePlanet(200));
    const summary = out.narration.find((l) => l.includes('In the attack our troops killed'));
    expect(summary).toBeDefined();
    // Guard the guard: if the two counts happened to be equal this assertion
    // could not tell the orders apart at all.
    expect(out.kill1).not.toBe(out.kill2);
    expect(summary).toBe(`In the attack our troops killed ${out.kill2}, and suffered losses\nof ${out.kill1}, Sir!`);
  });

  it('pairs ATTACKM7 with ATTACKM8 when the planet has fighters, never one alone', async () => {
    const out = await makeService(7).attackTroop(300, makeShip(), makePlanet(200, 40));
    const counter = out.narration.findIndex((l) => l.includes(stem('ATTACKM7')));
    expect(counter).toBeGreaterThanOrEqual(0);
    expect(out.narration[counter + 1]).toContain('of our troops, Sir!');
  });

  it('says nothing about ground kills on a line of their own', async () => {
    // Canon folds them into kill1 and reports once. The port announced them,
    // then counted them again in the summary.
    const out = await makeService(11).attackTroop(300, makeShip(), makePlanet(200));
    expect(out.narration.filter((l) => /killed|destroyed/i.test(l)).length).toBeLessThanOrEqual(2);
  });

  it('reports troops returning only when some survived', async () => {
    const out = await makeService(11).attackTroop(300, makeShip(), makePlanet(200));
    const returned = out.narration.some((l) => l.includes('have returned to the ship'));
    expect(returned).toBe(out.left1 > 0);
  });
});

describe('fighter assault narration follows canon', () => {
  it('opens on ATTACKF1, the launch', async () => {
    const out = await makeService(3).attackFighter(300, makeShip(), makePlanet(200, 100));
    expect(out.narration[0]).toContain(stem('ATTACKF1'));
  });

  it('uses ATTACKF2, not the troop wording, and puts their losses first', async () => {
    const out = await makeService(3).attackFighter(300, makeShip(), makePlanet(200, 100));
    const summary = out.narration.find((l) => l.includes('our fighters destroyed'));
    expect(summary).toBeDefined();
    expect(summary).toContain(`destroyed  ${out.kill2} fighters`);
    expect(summary).toContain(`and we lost  ${out.kill1}`);
  });

  it('reports fighters returning only when some survived', async () => {
    const out = await makeService(3).attackFighter(300, makeShip(), makePlanet(200, 100));
    const returned = out.narration.some((l) => l.includes('fighters have returned to the ship'));
    expect(returned).toBe(out.left1 > 0);
  });
});
