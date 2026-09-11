import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { AppModule } from '../../../src/app.module';
import request from 'supertest';

process.env['JWT_SECRET'] = 'test-secret-123';
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];

/**
 * Finding 4 (final whole-branch review, 2026-09-07): /auth/* had no rate
 * limit. bcrypt cost 12 is ~300ms on a libuv thread pool of 4, so ~15
 * unauthenticated requests/second saturates the same box the 1-second game
 * tick runs on, and registration was unbounded. This pins that a burst of
 * requests to a single auth route from one caller eventually gets a 429,
 * without asserting the exact threshold (an implementation detail that may
 * be retuned) — only that a limit exists at all.
 *
 * Deliberately uses invalid credentials: the guard must reject the request
 * BEFORE the (slow, DB-hitting) handler runs, so this stays fast and proves
 * the limit is enforced at the guard layer, not as a side effect of the
 * login handler's own logic.
 */
describe('POST /auth/login rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 15000);

  it('eventually responds 429 to a burst of requests from the same caller', async () => {
    const attempts = 30;
    const statuses: number[] = [];

    for (let i = 0; i < attempts; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrongPassword1' });
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  }, 30000);
});
