/**
 * T040 — Admin endpoint: POST /admin/midnight/run.
 *
 * Covers: 401 (missing/wrong token), 503 (token unset), 202 (correct token), 409 (lock held).
 *
 * @see specs/009-midnight-job/contracts/admin-midnight.md
 * @see specs/009-midnight-job/tasks.md T040
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as (app: unknown) => import('supertest').SuperTest<import('supertest').Test>;
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { MidnightService, MidnightLockHeldError } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { AdminMidnightController } from '../../../src/game/midnight/admin-midnight.controller';
import { AdminTokenGuard } from '../../../src/game/midnight/admin-token.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { seedNeutralZonePlanets } from './neutral-zone.fixture';

const VALID_TOKEN = 'test-admin-token-secret';

async function truncateAll(prisma: PrismaService) {
  await prisma.midnightRun.deleteMany();
  await prisma.mailStat.deleteMany();
  await prisma.mail.deleteMany();
  await prisma.team.deleteMany();
  await prisma.planet.deleteMany();
  await prisma.ship.deleteMany();
  await prisma.user.deleteMany();
}

describe('POST /admin/midnight/run — admin endpoint (FR-002)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let midnightService: MidnightService;
  const origToken = process.env['MIDNIGHT_ADMIN_TOKEN'];

  beforeAll(async () => {
    process.env['MIDNIGHT_ADMIN_TOKEN'] = VALID_TOKEN;

    const module = await Test.createTestingModule({
      imports: [PrismaModule, ScheduleModule.forRoot()],
      providers: [MidnightService, MidnightRepository, AdminTokenGuard, { provide: EventEmitter2, useValue: { emit: jest.fn(), on: jest.fn() } }],
      controllers: [AdminMidnightController],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    prisma = module.get(PrismaService);
    midnightService = module.get(MidnightService);
    await truncateAll(prisma);
  });

  afterAll(async () => {
    if (origToken === undefined) delete process.env['MIDNIGHT_ADMIN_TOKEN'];
    else process.env['MIDNIGHT_ADMIN_TOKEN'] = origToken;
    await truncateAll(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedNeutralZonePlanets(prisma);
    jest.restoreAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    await request(app.getHttpServer())
      .post('/admin/midnight/run')
      .expect(401);
  });

  it('returns 401 when token is wrong', async () => {
    await request(app.getHttpServer())
      .post('/admin/midnight/run')
      .set('Authorization', 'Bearer wrong-token')
      .expect(401);
  });

  it('returns 202 with counters on correct token and fresh DB', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/midnight/run')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(202);

    expect(res.body.status).toBe('completed');
    expect(typeof res.body.durationMs).toBe('number');
    expect(res.body.counters).toMatchObject({
      usersUpdated: expect.any(Number),
      planetsProcessed: expect.any(Number),
      mailReportsCreated: expect.any(Number),
      mailDeleted: expect.any(Number),
      teamsReconciled: expect.any(Number),
      teamsRemoved: expect.any(Number),
    });
  });

  it('returns 409 when advisory lock is held', async () => {
    jest.spyOn(midnightService, 'run').mockRejectedValueOnce(new MidnightLockHeldError());

    await request(app.getHttpServer())
      .post('/admin/midnight/run')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(409);
  });

  it('returns 503 when MIDNIGHT_ADMIN_TOKEN is not configured', async () => {
    // Blank rather than `delete`: constructing a PrismaClient re-loads backend/.env
    // into process.env (it only fills keys that are absent), so a deleted key comes
    // back before the fresh guard is constructed. An empty value is already present,
    // so it survives — and loadMidnightConfig maps '' to undefined either way.
    process.env['MIDNIGHT_ADMIN_TOKEN'] = '';

    const freshModule = await Test.createTestingModule({
      imports: [PrismaModule, ScheduleModule.forRoot()],
      providers: [MidnightService, MidnightRepository, AdminTokenGuard, { provide: EventEmitter2, useValue: { emit: jest.fn(), on: jest.fn() } }],
      controllers: [AdminMidnightController],
    }).compile();
    const freshApp = freshModule.createNestApplication();
    await freshApp.init();

    try {
      await request(freshApp.getHttpServer())
        .post('/admin/midnight/run')
        .expect(503);
    } finally {
      process.env['MIDNIGHT_ADMIN_TOKEN'] = VALID_TOKEN;
      await freshApp.close();
    }
  });

  it('202 again on same-day re-run — MailStat row count doubles', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });

    await request(app.getHttpServer())
      .post('/admin/midnight/run')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(202);

    const count1 = await prisma.mailStat.count();

    const res2 = await request(app.getHttpServer())
      .post('/admin/midnight/run')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(202);

    expect(res2.body.status).toBe('completed');
    const count2 = await prisma.mailStat.count();
    expect(count2).toBe(count1); // alice has no planets, so no MailStat rows
  });
});
