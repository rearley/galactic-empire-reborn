/**
 * T012 / T022 — Integration tests for MidnightService.run() against a real test DB.
 *
 * US1 assertions: per-user score, plscore, planets, population, rospos.
 * US2 assertions: MailStat rows per owned planet.
 *
 * Test DB is seeded fresh in beforeEach; rows from other tests are not visible
 * because the test suite runs with maxWorkers=1 and each describe's beforeEach
 * seeds only what it needs (no global shared state within suites).
 *
 * @see GEMAIN.C:gemidnighta (1084-1335)
 * @see specs/009-midnight-job/tasks.md T012, T022
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ABANDONED_SIGNUP_DAYS } from '../../../src/game/midnight/midnight.constants';
import { ScheduleModule } from '@nestjs/schedule';
import { PLTVCASH, PLTVDIV, MAIL_CLASS_PRODRPT } from '../../../src/game/midnight/midnight.constants';
import { valuePlanet } from '../../../src/game/midnight/value-pl';
import { ITEM_VALUE, NUMITEMS, I_MEN, I_GOLD } from '../../../src/game/constants/items';
import { PLTYPE_PLNT } from '../../../src/game/constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { seedNeutralZonePlanets } from './neutral-zone.fixture';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItemsQty(menQty: bigint = 0n): bigint[] {
  const qty = Array<bigint>(NUMITEMS).fill(0n);
  qty[I_MEN] = menQty;
  return qty;
}

function makePlanetRow(overrides: Record<string, unknown> = {}) {
  return {
    xsect: 1, ysect: 1, plnum: 1,
    type: PLTYPE_PLNT,
    xcoord: 1.0, ycoord: 1.0,
    userid: 'alice',
    name: 'AlphaPlanet',
    enviorn: 5, resource: 10,
    cash: 500_000n, debt: 0n, tax: 50_000n,
    taxrate: 5, warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    itemsQty: makeItemsQty(50_000n),
    itemsRate: Array<number>(NUMITEMS).fill(0),
    itemsSell: Array<number>(NUMITEMS).fill(0),
    itemsReserve: Array<number>(NUMITEMS).fill(0),
    itemsMarkup2a: Array<number>(NUMITEMS).fill(0),
    itemsSold2a: Array<bigint>(NUMITEMS).fill(0n),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let app: TestingModule;
let prisma: PrismaService;
let service: MidnightService;

async function truncateAll() {
  await prisma.midnightRun.deleteMany();
  await prisma.mailStat.deleteMany();
  await prisma.mail.deleteMany();
  await prisma.team.deleteMany();
  await prisma.planet.deleteMany();
  await prisma.ship.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(async () => {
  app = await Test.createTestingModule({
    imports: [PrismaModule, ScheduleModule.forRoot()],
    providers: [MidnightService, MidnightRepository, { provide: EventEmitter2, useValue: { emit: jest.fn(), on: jest.fn() } }],
  }).compile();
  prisma = app.get(PrismaService);
  service = app.get(MidnightService);
  await app.init();
});

afterAll(async () => {
  await truncateAll();
  await app.close();
});

beforeEach(async () => {
  await truncateAll();
  await seedNeutralZonePlanets(prisma);
});

// ---------------------------------------------------------------------------
// US1: Daily score recalculation (T012)
// ---------------------------------------------------------------------------

describe('US1 — score recalculation and rospos ranking', () => {
  it('computes plscore = sum of owned-planet net-worths', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 10_000n } });
    await prisma.planet.create({ data: makePlanetRow({ userid: 'alice' }) });

    await service.run();

    const user = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    const expectedPlscore = valuePlanet(500_000n, 50_000n, makeItemsQty(50_000n), ITEM_VALUE, PLTVCASH, PLTVDIV);
    expect(user.plscore).toBe(expectedPlscore);
    expect(user.planets).toBe(1);
  });

  /**
   * Canon scores a planet from ITMVAL — the item POINT-VALUE table — not from
   * the shop price table.
   *
   *   value[i] = lngopt(ITMVAL01+i,...)          GEMAIN.C:563
   *   v += (value[i] * (plptr->items[i].qty/pltvdiv))   GEMAIN.C:1357
   *
   * The shipped values are `ITMVAL01 {Point Value of man: 10}` and ZERO for
   * every other item (MBMGEMSG.MSG:1265-1330). The port passed BASEPRICE
   * instead, where gold is 1000 and a man is 2 — so a colony that hoarded gold
   * climbed the roster while population, the only thing canon scores, was
   * credited at a fifth of its worth.
   */
  it('scores population and ignores stockpiles, as canon ITMVAL does', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });
    const qty = Array<bigint>(NUMITEMS).fill(0n);
    qty[I_MEN] = 1_000_000n;
    qty[I_GOLD] = 1_000_000n;
    await prisma.planet.create({
      data: makePlanetRow({ userid: 'alice', cash: 0n, tax: 0n, itemsQty: qty }),
    });

    await service.run();

    const user = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    expect(user.plscore).toBe(
      valuePlanet(0n, 0n, qty, ITEM_VALUE, PLTVCASH, PLTVDIV),
    );
  });

  it('gives a gold hoard no score at all', async () => {
    // The clearest statement of the rule, independent of any table: two
    // colonies with the same population score the same, however much treasure
    // one of them is sitting on.
    await prisma.user.create({ data: { userid: 'poor', username: 'poor', klscore: 0n } });
    await prisma.user.create({ data: { userid: 'rich', username: 'rich', klscore: 0n } });

    const bare = Array<bigint>(NUMITEMS).fill(0n);
    bare[I_MEN] = 500_000n;
    const hoard = Array<bigint>(NUMITEMS).fill(0n);
    hoard[I_MEN] = 500_000n;
    hoard[I_GOLD] = 9_000_000n;

    await prisma.planet.create({
      data: makePlanetRow({ userid: 'poor', xsect: 1, ysect: 1, plnum: 1, cash: 0n, tax: 0n, itemsQty: bare }),
    });
    await prisma.planet.create({
      data: makePlanetRow({ userid: 'rich', xsect: 2, ysect: 2, plnum: 1, cash: 0n, tax: 0n, itemsQty: hoard }),
    });

    await service.run();

    const poor = await prisma.user.findUniqueOrThrow({ where: { userid: 'poor' } });
    const rich = await prisma.user.findUniqueOrThrow({ where: { userid: 'rich' } });
    expect(rich.plscore).toBe(poor.plscore);
  });

  it('sets score = plscore + klscore', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 5_000n } });
    await prisma.planet.create({ data: makePlanetRow({ userid: 'alice', cash: 1_000_000n, tax: 0n }) });

    await service.run();

    const user = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    const expectedPlscore = valuePlanet(1_000_000n, 0n, makeItemsQty(50_000n), ITEM_VALUE, PLTVCASH, PLTVDIV);
    expect(user.score).toBe(expectedPlscore + 5_000n);
  });

  it('klscore is unchanged after pass', async () => {
    const originalKlscore = 42_000n;
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: originalKlscore } });

    await service.run();

    const user = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    expect(user.klscore).toBe(originalKlscore);
  });

  it('accumulates population = men / 10000', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });
    const itemsQty = makeItemsQty(100_000n); // 100k men → 10 population
    await prisma.planet.create({ data: makePlanetRow({ userid: 'alice', itemsQty }) });

    await service.run();

    const user = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    expect(user.population).toBe(10n); // 100_000 / 10_000 = 10
  });

  it('skips AI users (@-prefix) in rospos ranking', async () => {
    await prisma.user.createMany({
      data: [
        { userid: 'alice', username: 'alice', score: 500n, klscore: 500n },
        { userid: '@bot1', username: '@bot1', score: 1000n, klscore: 1000n },
      ],
    });

    await service.run();

    const alice = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    const bot = await prisma.user.findUniqueOrThrow({ where: { userid: '@bot1' } });
    // alice has lower pre-reset klscore but only she qualifies
    // After run, score = plscore + klscore. With no planets, plscore=0, score=klscore (500 for alice)
    expect(alice.rospos).toBe(1);
    expect(bot.rospos).toBe(0); // reset, was never ranked
  });

  it('skips KEY in rospos ranking', async () => {
    await prisma.user.createMany({
      data: [
        { userid: 'KEY', username: 'KEY', score: 999_999n, klscore: 999_999n },
        { userid: 'alice', username: 'alice', score: 1000n, klscore: 1000n },
      ],
    });

    await service.run();

    const key = await prisma.user.findUniqueOrThrow({ where: { userid: 'KEY' } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    expect(key.rospos).toBe(0);
    expect(alice.rospos).toBeGreaterThan(0);
  });

  it('users with score=0 get rospos=0', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });

    await service.run();

    const alice = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    expect(alice.rospos).toBe(0);
  });

  it('writes a MidnightRun ledger row', async () => {
    await service.run();

    const runs = await prisma.midnightRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('logs the abandoned-signup count AFTER the delete — the only unattended DELETE in the system must leave a record of what it removed', async () => {
    // Finding 6 (final whole-branch review, 2026-09-07): phase 5's log line
    // fired before the delete ran, with no count anywhere in it. Seed one
    // signup old enough to be swept and confirm a log line names how many
    // rows were actually purged.
    await prisma.user.create({
      data: {
        userid: 'ghost_signup',
        username: null,
        passwordHash: 'hash',
        email: 'ghost_signup@example.test',
        createdAt: new Date(Date.now() - (ABANDONED_SIGNUP_DAYS + 1) * 86_400_000),
        options: [],
      },
    });

    const logSpy = jest.spyOn(Logger.prototype, 'log');

    await service.run();

    // Deliberately scoped to the phase-5 log line itself, not the final
    // `midnight.complete` JSON summary (which already carries every counter,
    // including this one, regardless of this fix) — otherwise this
    // assertion would pass even against the old code.
    const purgeLine = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((msg) => /^midnight: phase 5/.test(msg) && /purged/i.test(msg) && /\b1\b/.test(msg));
    expect(purgeLine).toBeDefined();

    logSpy.mockRestore();
  });

  it('silently skips planets with no matching User row', async () => {
    // Planet references 'ghost' user who has no User row
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });
    await prisma.planet.create({ data: makePlanetRow({ userid: 'ghost', xsect: 2, ysect: 2 }) });

    await expect(service.run()).resolves.not.toThrow();

    const alice = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    expect(alice.planets).toBe(0); // alice has no planets
    const mailStats = await prisma.mailStat.findMany();
    expect(mailStats).toHaveLength(0); // no report for ghost's planet
  });

  it('handles 5 users + 1 AI + assorted planets + klscores correctly', async () => {
    await prisma.user.createMany({
      data: [
        { userid: 'alice', username: 'alice', klscore: 1_000n },
        { userid: 'bob', username: 'bob', klscore: 2_000n },
        { userid: 'carol', username: 'carol', klscore: 500n },
        { userid: 'dave', username: 'dave', klscore: 0n },
        { userid: 'eve', username: 'eve', klscore: 3_000n },
        { userid: '@aibot', username: '@aibot', klscore: 99_000n },
      ],
    });

    // alice owns 2 planets
    await prisma.planet.createMany({
      data: [
        makePlanetRow({ userid: 'alice', xsect: 1, ysect: 1, plnum: 1, cash: 100_000n, tax: 10_000n }),
        makePlanetRow({ userid: 'alice', xsect: 1, ysect: 2, plnum: 1, cash: 200_000n, tax: 20_000n }),
        makePlanetRow({ userid: 'bob', xsect: 2, ysect: 1, plnum: 1, cash: 500_000n, tax: 50_000n }),
      ],
    });

    const counters = await service.run();

    const alice = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    const bob = await prisma.user.findUniqueOrThrow({ where: { userid: 'bob' } });

    expect(alice.planets).toBe(2);
    expect(bob.planets).toBe(1);

    // The seeded rows carry 50,000 colonists each (makePlanetRow default), and
    // stockpiles now contribute to net worth — with the old PLTVDIV every item
    // term truncated to zero, so this mismatch was invisible.
    const expectedAlicePlscore =
      valuePlanet(100_000n, 10_000n, makeItemsQty(50_000n), ITEM_VALUE, PLTVCASH, PLTVDIV) +
      valuePlanet(200_000n, 20_000n, makeItemsQty(50_000n), ITEM_VALUE, PLTVCASH, PLTVDIV);
    expect(alice.plscore).toBe(expectedAlicePlscore);
    expect(alice.score).toBe(expectedAlicePlscore + 1_000n);

    // No MailStat for @aibot
    const aiStats = await prisma.mailStat.findMany({ where: { userid: '@aibot' } });
    expect(aiStats).toHaveLength(0);

    expect(counters.planetsProcessed).toBe(3);
    expect(counters.mailReportsCreated).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// US2: Production report mail (T022)
// ---------------------------------------------------------------------------

describe('US2 — planet production report MailStat rows', () => {
  it('inserts one MailStat row per owned planet', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });
    await prisma.planet.createMany({
      data: [
        makePlanetRow({ userid: 'alice', xsect: 1, ysect: 1, plnum: 1 }),
        makePlanetRow({ userid: 'alice', xsect: 1, ysect: 2, plnum: 1 }),
      ],
    });

    await service.run();

    const rows = await prisma.mailStat.findMany({ where: { userid: 'alice' } });
    expect(rows).toHaveLength(2);
  });

  it('inserts no MailStat for unowned planets', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });
    await prisma.planet.create({ data: makePlanetRow({ userid: null, xsect: 3, ysect: 3 }) });

    await service.run();

    const rows = await prisma.mailStat.findMany();
    expect(rows).toHaveLength(0);
  });

  it('silently skips planets with unknown owner (no MailStat inserted)', async () => {
    await prisma.planet.create({ data: makePlanetRow({ userid: 'nobody' }) });

    await service.run();

    const rows = await prisma.mailStat.findMany();
    expect(rows).toHaveLength(0);
  });

  it('sets class = MAIL_CLASS_PRODRPT on each row', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });
    await prisma.planet.create({ data: makePlanetRow({ userid: 'alice' }) });

    await service.run();

    const rows = await prisma.mailStat.findMany();
    expect(rows.every((r) => r.class === MAIL_CLASS_PRODRPT)).toBe(true);
  });

  it('10 players × multiple planets produces correct per-player row counts', async () => {
    const users = Array.from({ length: 10 }, (_, i) => ({ userid: `user${i}`, username: `user${i}`, klscore: 0n }));
    await prisma.user.createMany({ data: users });

    const planets = [];
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 3; j++) {
        planets.push(makePlanetRow({
          userid: `user${i}`,
          xsect: i + 1,
          ysect: j + 1,
          plnum: 1,
        }));
      }
    }
    await prisma.planet.createMany({ data: planets });

    await service.run();

    for (let i = 0; i < 10; i++) {
      const rows = await prisma.mailStat.findMany({ where: { userid: `user${i}` } });
      expect(rows).toHaveLength(3);
    }
  });
});
