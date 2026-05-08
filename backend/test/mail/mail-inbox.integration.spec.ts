/**
 * T011 / T016 / T020 — Integration tests for MailInboxService against real Postgres.
 * Tests list, resolveIndex (rea), and deleteByIndex (del) against seeded MailStat rows.
 *
 * @see GEMAIN.H:531 MAILSTAT
 * @see specs/017-mail-inbox/tasks.md T011, T016, T020
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { MailInboxService } from '../../src/game/mail/mail-inbox.service';
import { MailInboxRepository } from '../../src/game/mail/mail-inbox.repository';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { MAIL_CLASS_DISTRESS } from '../../src/game/constants';
import { MAIL_CLASS_PRODRPT } from '../../src/game/midnight/midnight.constants';
import { NUMITEMS } from '../../src/game/constants/items';

// ─── Test setup ──────────────────────────────────────────────────────────────

let app: TestingModule;
let prisma: PrismaService;
let service: MailInboxService;

const TEST_USER = 'integ_alice';

async function truncate() {
  await prisma.mailStat.deleteMany({ where: { userid: TEST_USER } });
  await prisma.user.deleteMany({ where: { userid: TEST_USER } });
}

beforeAll(async () => {
  const mockShipState = {
    findByUserid: jest.fn().mockReturnValue([]),
  };

  app = await Test.createTestingModule({
    imports: [PrismaModule],
    providers: [
      MailInboxRepository,
      MailInboxService,
      { provide: ShipStateService, useValue: mockShipState },
    ],
  }).compile();

  prisma = app.get(PrismaService);
  service = app.get(MailInboxService);
  await app.init();
});

afterAll(async () => {
  await truncate();
  await app.close();
});

beforeEach(async () => {
  await truncate();
  await prisma.user.create({ data: { userid: TEST_USER, username: TEST_USER, klscore: 0n } });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stampOffset(n: number) {
  return Math.floor(Date.now() / 1000) - n;
}

function distressRow(msgnoOffset = 0, stampDelta = 0) {
  return {
    userid: TEST_USER,
    class: MAIL_CLASS_DISTRESS,
    msgno: BigInt(1_000_000 + msgnoOffset),
    stamp: stampOffset(stampDelta),
    type: 2,
    dtime: 'attacker_user',
    topic: 'AttackerShip',
    name1: 'TestPlanet',
    int1: 3,
    int2: 5,
    cash: 0n,
    debt: 0n,
    tax: 0n,
    itemqty: [],
  };
}

function productionRow(msgnoOffset = 0, stampDelta = 1) {
  return {
    userid: TEST_USER,
    class: MAIL_CLASS_PRODRPT,
    msgno: BigInt(2_000_000 + msgnoOffset),
    stamp: stampOffset(stampDelta),
    type: 20,
    dtime: '',
    topic: '',
    name1: 'VegaPlanet',
    int1: 7,
    int2: 4,
    cash: 1_250_000n,
    debt: 0n,
    tax: 87_500n,
    itemqty: Array.from({ length: NUMITEMS }, (_, i) => BigInt((i + 1) * 100)),
  };
}

// ─── T011: US1 — List inbox ───────────────────────────────────────────────────

describe('T011 — US1: mai — list inbox', () => {
  it('returns empty listing when no rows', async () => {
    const listing = await service.list(TEST_USER);
    expect(listing.empty).toBe(true);
    expect(listing.entries).toHaveLength(0);
  });

  it('seeds 3 rows and lists them with 1-based indices', async () => {
    await prisma.mailStat.createMany({
      data: [distressRow(0, 0), productionRow(0, 1), distressRow(1, 2)],
    });

    const listing = await service.list(TEST_USER);
    expect(listing.entries).toHaveLength(3);
    expect(listing.entries[0].index).toBe(1);
    expect(listing.entries[1].index).toBe(2);
    expect(listing.entries[2].index).toBe(3);
  });

  it('orders by stamp DESC (newest first) per R4', async () => {
    await prisma.mailStat.createMany({
      data: [
        distressRow(0, 5),    // oldest
        productionRow(0, 2),  // middle
        distressRow(1, 0),    // newest
      ],
    });

    const listing = await service.list(TEST_USER);
    expect(listing.entries[0].stamp).toBeGreaterThanOrEqual(listing.entries[1].stamp);
    expect(listing.entries[1].stamp).toBeGreaterThanOrEqual(listing.entries[2].stamp);
  });

  it('class labels match data-model class label table', async () => {
    await prisma.mailStat.createMany({
      data: [distressRow(0, 0), productionRow(0, 1)],
    });

    const listing = await service.list(TEST_USER);
    const classes = new Set(listing.entries.map((e) => e.classLabel));
    expect(classes).toContain('Distress Signal');
    expect(classes).toContain('Production Report');
  });

  it('sender falls through to raw dtime for unknown user (R3)', async () => {
    await prisma.mailStat.create({ data: distressRow(0, 0) });

    const listing = await service.list(TEST_USER);
    expect(listing.entries[0].sender).toBe('attacker_user');
  });

  it('sender is "(system)" when dtime is empty (R3)', async () => {
    await prisma.mailStat.create({ data: productionRow(0, 0) });

    const listing = await service.list(TEST_USER);
    const prodEntry = listing.entries.find((e) => e.class === MAIL_CLASS_PRODRPT);
    expect(prodEntry?.sender).toBe('(system)');
  });
});

// ─── T016: US2 — Read message detail ─────────────────────────────────────────

describe('T016 — US2: rea — read message detail', () => {
  it('rea 1 resolves to distress row and returns sector coords (int1, int2)', async () => {
    await prisma.mailStat.createMany({
      data: [distressRow(0, 0), productionRow(0, 1)],
    });

    const entry = await service.resolveIndex(TEST_USER, 1);
    expect(entry).not.toBeNull();
    expect(entry?.class).toBe(MAIL_CLASS_DISTRESS);
    expect(entry?.payload.kind).toBe('distress_signal');
    if (entry?.payload.kind === 'distress_signal') {
      expect(entry.payload.sectorX).toBe(3);
      expect(entry.payload.sectorY).toBe(5);
    }
  });

  it('rea 2 resolves to production row and returns financial fields and itemqty[14]', async () => {
    await prisma.mailStat.createMany({
      data: [distressRow(0, 0), productionRow(0, 1)],
    });

    const entry = await service.resolveIndex(TEST_USER, 2);
    expect(entry).not.toBeNull();
    expect(entry?.class).toBe(MAIL_CLASS_PRODRPT);
    expect(entry?.payload.kind).toBe('production_report');
    if (entry?.payload.kind === 'production_report') {
      expect(entry.payload.cash).toBe(1_250_000n);
      expect(entry.payload.debt).toBe(0n);
      expect(entry.payload.tax).toBe(87_500n);
      expect(entry.payload.itemqty).toHaveLength(14);
    }
  });

  it('rea 99 returns null and MailStat row count is unchanged', async () => {
    await prisma.mailStat.create({ data: distressRow(0, 0) });

    const entry = await service.resolveIndex(TEST_USER, 99);
    expect(entry).toBeNull();

    const count = await prisma.mailStat.count({ where: { userid: TEST_USER } });
    expect(count).toBe(1);
  });
});

// ─── T020: US3 — Delete message ───────────────────────────────────────────────

describe('T020 — US3: del — delete message', () => {
  it('del 2 removes the second row and confirms', async () => {
    await prisma.mailStat.createMany({
      data: [distressRow(0, 0), productionRow(0, 1), distressRow(1, 2)],
    });

    const result = await service.deleteByIndex(TEST_USER, 2);
    expect(result).toBe(true);

    const remaining = await prisma.mailStat.count({ where: { userid: TEST_USER } });
    expect(remaining).toBe(2);
  });

  it('subsequent list after del shows 2 entries with new indices 1 and 2', async () => {
    await prisma.mailStat.createMany({
      data: [distressRow(0, 0), productionRow(0, 1), distressRow(1, 2)],
    });
    await service.deleteByIndex(TEST_USER, 2);

    const listing = await service.list(TEST_USER);
    expect(listing.entries).toHaveLength(2);
    expect(listing.entries[0].index).toBe(1);
    expect(listing.entries[1].index).toBe(2);
  });

  it('del 99 makes no row deletion', async () => {
    await prisma.mailStat.createMany({
      data: [distressRow(0, 0), productionRow(0, 1), distressRow(1, 2)],
    });

    const result = await service.deleteByIndex(TEST_USER, 99);
    expect(result).toBe(false);

    const remaining = await prisma.mailStat.count({ where: { userid: TEST_USER } });
    expect(remaining).toBe(3);
  });

  it('double-delete: second del 2 targets a different row (R5 re-resolution)', async () => {
    await prisma.mailStat.createMany({
      data: [distressRow(0, 0), productionRow(0, 1), distressRow(1, 2)],
    });

    // Capture the composite key of index 2 before first delete
    const listingBefore = await service.list(TEST_USER);
    const firstTarget = listingBefore.entries[1]; // index 2

    const result1 = await service.deleteByIndex(TEST_USER, 2);
    expect(result1).toBe(true);
    const countAfterFirst = await prisma.mailStat.count({ where: { userid: TEST_USER } });
    expect(countAfterFirst).toBe(2);

    // Capture the composite key of the new index 2
    const listingAfter = await service.list(TEST_USER);
    const secondTarget = listingAfter.entries[1]; // index 2 of remaining 2-row list

    const result2 = await service.deleteByIndex(TEST_USER, 2);
    expect(result2).toBe(true);
    const countAfterSecond = await prisma.mailStat.count({ where: { userid: TEST_USER } });
    expect(countAfterSecond).toBe(1);

    // Assert the two deleted rows have different composite keys
    expect({ class: firstTarget.class, msgno: firstTarget.msgno }).not.toEqual({
      class: secondTarget.class,
      msgno: secondTarget.msgno,
    });
  });
});

// ─── T030: Performance micro-benchmark ───────────────────────────────────────

describe('T030 — performance: list() with 50 rows < 50ms', () => {
  it('lists 50 rows in under 50ms on warm connection', async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      i % 2 === 0 ? distressRow(i, i) : productionRow(i, i),
    );
    await prisma.mailStat.createMany({ data: rows });

    // Warm-up call (untimed)
    await service.list(TEST_USER);

    const start = performance.now();
    await service.list(TEST_USER);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
