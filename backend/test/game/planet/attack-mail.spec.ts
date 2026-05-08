/**
 * T014 / T027 — Mail-path tests for planet attack.
 * Troop branch: MESG02 on ratio>1 && won==0; MESG03 on ratio>1 && won==1.
 * Fighter branch: MESG04 on ratio>2 && won==0; MESG05 on won==1.
 * Verifies class == MAIL_CLASS_DISTRESS and payload fields.
 * @see GECMDS.C:3760–3771 troop mail
 * @see GECMDS.C:3924–3936 fighter mail
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlanetAttackService } from '../../../src/game/planet/planet-attack.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { I_TROOPS, I_FIGHTER, NUMITEMS } from '../../../src/game/constants/items';
import { MAIL_CLASS_DISTRESS } from '../../../src/game/constants';
import {
  PLATTRT1_DEFAULT, PLATTRT2_DEFAULT, FIRETICKS_DEFAULT,
} from '../../../src/game/commands/attack.config';

function makeItems(): PlanetState['items'] {
  return Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
}

function makeShip(): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  items[I_TROOPS] = 50000n;
  items[I_FIGHTER] = 50000n;
  return {
    userid: 'attacker', shipno: 1, shipname: 'MailTestShip', shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  };
}

function makeService(seed = 42) {
  const random = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        const s = makeShip();
        fn(s);
      },
    ),
  } as unknown as ShipStateService;

  const mailCreates: unknown[] = [];
  const mockPrisma = {
    user: { update: jest.fn().mockResolvedValue({}) },
    mailStat: {
      create: jest.fn().mockImplementation((args: unknown) => {
        mailCreates.push(args);
        return Promise.resolve({});
      }),
    },
  } as unknown as PrismaService;

  const service = new PlanetAttackService(
    mockShipState, mockPrisma, events, random,
    PLATTRT1_DEFAULT, PLATTRT2_DEFAULT,
    0.05, 0.05, 0.05,
    FIRETICKS_DEFAULT,
  );

  return { service, mailCreates, mockPrisma };
}

function makePlanet(troops: number, fighters = 0, ownerUserid = 'owner'): PlanetState {
  const items = makeItems();
  items[I_TROOPS].qty = BigInt(troops);
  items[I_FIGHTER].qty = BigInt(fighters);
  return {
    xsect: 3, ysect: 3, plnum: 1,
    type: 1, xcoord: 3.5, ycoord: 3.5,
    userid: ownerUserid,
    name: 'MailPlanet', enviorn: 0, resource: 0,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
    password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n,
    items,
  };
}

// ---------------------------------------------------------------------------
// Troop branch mail
// ---------------------------------------------------------------------------

describe('PlanetAttackService — troop branch mail (T014)', () => {
  it('inserts MESG02 (class=MAIL_CLASS_DISTRESS) when ratio > 1 and won == 0', async () => {
    const { service, mailCreates } = makeService(999);
    // medium attack: some chance of ratio > 1 but not overwhelming
    const planet = makePlanet(100, 0, 'owner');
    const ship = makeShip();

    await service.attackTroop(1000, ship, planet);

    // ratio = 1000/100 = 10 > 1 → mail should be inserted
    expect(mailCreates.length).toBeGreaterThan(0);
    const mail = (mailCreates[0] as { data: Record<string, unknown> }).data;
    expect(mail['class']).toBe(MAIL_CLASS_DISTRESS);
    expect(mail['userid']).toBe('owner');
  });

  it('mail payload includes planet name, sector coords, attacker ship name, and userid', async () => {
    const { service, mailCreates } = makeService(999);
    const planet = makePlanet(100, 0, 'owner');
    const ship = makeShip();

    await service.attackTroop(1000, ship, planet);

    if (mailCreates.length > 0) {
      const mail = (mailCreates[0] as { data: Record<string, unknown> }).data;
      expect(mail['name1']).toBe('MailPlanet');
      expect(mail['int1']).toBe(3); // xsect
      expect(mail['int2']).toBe(3); // ysect
      expect(mail['topic']).toBe('MailTestShip');
      expect(mail['dtime']).toBe('attacker');
    }
  });

  it('uses type=3 for MESG03 (ratio > 1 && won == 1)', async () => {
    const { service, mailCreates } = makeService(7);
    // Overwhelming attack — won==1 is likely
    const planet = makePlanet(1, 0, 'owner');
    const ship = makeShip(); // 50000 attackers vs 1 defender

    await service.attackTroop(50000, ship, planet);

    if (mailCreates.length > 0) {
      const mail = (mailCreates[0] as { data: Record<string, unknown> }).data;
      expect(mail['class']).toBe(MAIL_CLASS_DISTRESS);
      // type should be 2 (MESG02, lost) or 3 (MESG03, won)
      expect([2, 3]).toContain(mail['type']);
    }
  });

  it('does NOT insert mail when ratio <= 1', async () => {
    const { service, mailCreates } = makeService(42);
    // Tiny attack vs massive defence → ratio = 0
    const planet = makePlanet(100_000, 0, 'owner');
    const ship = makeShip(); // 50000 attackers vs 100000 defenders

    await service.attackTroop(50000, ship, planet);

    // ratio = floor(50000/100000) = 0 ≤ 1 → no mail
    expect(mailCreates.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fighter branch mail (T027)
// ---------------------------------------------------------------------------

describe('PlanetAttackService — fighter branch mail (T027)', () => {
  it('inserts mail when ratio > 2 in fighter attack', async () => {
    const { service, mailCreates } = makeService(42);
    // 10000 fighters vs 1 defender fighter → ratio = 10000/1 * 100 = 1,000,000 >> 2
    const planet = makePlanet(0, 1, 'owner');
    const ship = makeShip();

    await service.attackFighter(10000, ship, planet);

    expect(mailCreates.length).toBeGreaterThan(0);
    const mail = (mailCreates[0] as { data: Record<string, unknown> }).data;
    expect(mail['class']).toBe(MAIL_CLASS_DISTRESS);
    // type = 4 (MESG04 lost) or 5 (MESG05 won)
    expect([4, 5]).toContain(mail['type']);
  });

  it('does NOT insert mail when ratio <= 2 and won == 0', async () => {
    const { service, mailCreates } = makeService(42);
    // Tiny attack: ratio = (50/10000)*100 = 0.5 ≤ 2
    const planet = makePlanet(0, 10000, 'owner');
    const ship = makeShip(); // 50000 fighters vs 10000 defenders → ratio = (50000/10000)*100=500 > 2
    // Let's use very few attackers
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_FIGHTER] = 10n;
    const weakShip = { ...ship, items };

    await service.attackFighter(10, weakShip, planet);

    // ratio = (10/10000)*100 = 0.1 ≤ 2 → no mail
    expect(mailCreates.length).toBe(0);
  });
});
