import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { PlanetEconomyService } from '../../src/game/planet/planet-economy.service';
import { SHIP_STATE_PORT, type ShipStatePort } from '../../src/game/ship/ship-state.port';
import { RANDOM, MathRandomAdapter } from '../../src/game/combat/random.port';
import { planetKey } from '../../src/game/planet/planet-state.types';
import { I_FOOD, I_MEN, NUMITEMS } from '../../src/game/constants/items';
import { MAIL_CLASS_DISTRESS } from '../../src/game/constants';

/**
 * `PlanetStateService` takes `PlanetEconomyService` as an OPTIONAL constructor
 * parameter and silently falls back to the pure formula when it is absent — so
 * every consequence that lives in the service (the revolt branch, starvation
 * distress mail) disappears without a single test failing. Nothing covered the
 * wired path: all existing tests construct `new PlanetStateService(prisma, ships)`
 * with two arguments.
 *
 * This drives a real tick through DI and asserts the owner is actually told.
 */
describe('PlanetStateService — economy service is wired in production', () => {
  let prisma: PrismaService;
  let planets: PlanetStateService;
  let close: () => Promise<void>;

  const OWNER = 'wiring_owner';
  const KEY = { xsect: 23, ysect: 11, plnum: 1 };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        PlanetStateService,
        PlanetEconomyService,
        { provide: RANDOM, useClass: MathRandomAdapter },
        // The seam is the narrow SHIP_STATE_PORT, not the whole ShipStateService.
        { provide: SHIP_STATE_PORT, useValue: { get: () => undefined } as unknown as ShipStatePort },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.mailStat.deleteMany({ where: { userid: OWNER } });
    await prisma.planet.deleteMany({ where: { ...KEY } });
    await prisma.user.deleteMany({ where: { userid: OWNER } });
    await prisma.user.create({ data: { userid: OWNER, username: OWNER } });
    await prisma.planet.create({
      data: {
        ...KEY,
        type: 2,
        xcoord: 23.5,
        ycoord: 11.5,
        userid: OWNER,
        name: 'Wiring Rock',
        enviorn: 1,
        resource: 1,
        password: 'none',
        // Starving: men/100 far exceeds food.
        itemsQty: Array.from({ length: NUMITEMS }, (_, i) => (i === I_MEN ? 8000n : 0n)),
        itemsRate: Array<number>(NUMITEMS).fill(0),
        itemsSell: Array<number>(NUMITEMS).fill(0),
        itemsReserve: Array<number>(NUMITEMS).fill(0),
        itemsMarkup2a: Array<number>(NUMITEMS).fill(0),
        itemsSold2a: Array<bigint>(NUMITEMS).fill(0n),
      },
    });

    planets = moduleRef.get(PlanetStateService);
    await planets.onModuleInit();
    close = () => moduleRef.close();
  });

  afterAll(async () => {
    await prisma.mailStat.deleteMany({ where: { userid: OWNER } });
    await prisma.planet.deleteMany({ where: { ...KEY } });
    await prisma.user.deleteMany({ where: { userid: OWNER } });
    await close();
  });

  it('a starving colony mails its owner through the wired tick path', async () => {
    await planets.runEconomicTickFor(planetKey(KEY.xsect, KEY.ysect, KEY.plnum));
    // The mail insert is fire-and-forget inside the tick.
    await new Promise((r) => setTimeout(r, 250));

    const state = planets.get(KEY.xsect, KEY.ysect, KEY.plnum);
    expect(Number(state?.items[I_MEN].qty)).toBe(7000); // 8000 - 8000/8
    expect(Number(state?.items[I_FOOD].qty)).toBe(0);

    const mail = await prisma.mailStat.findMany({ where: { userid: OWNER } });
    expect(mail).toHaveLength(1);
    expect(mail[0].class).toBe(MAIL_CLASS_DISTRESS);
    expect(mail[0].type).toBe(7); // MESG07 — men
    expect(mail[0].name1).toBe('Wiring Rock');
    expect(Number(mail[0].cash)).toBe(1000);
  });
});
