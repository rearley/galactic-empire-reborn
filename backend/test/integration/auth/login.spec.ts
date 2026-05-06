import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as (app: unknown) => import('supertest').SuperTest<import('supertest').Test>;
import { AppModule } from '../../../src/app.module';
import { PrismaClient } from '@prisma/client';

// Must be set BEFORE AppModule is imported/instantiated so ConfigModule picks it up.
process.env['JWT_SECRET'] = 'test-secret-123';
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['TEST_DATABASE_URL'] } },
});

describe('POST /auth/login', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  }, 15000);

  afterEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');
  });

  // Helper: register a user via the HTTP endpoint.
  async function registerUser(username: string, password: string): Promise<void> {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password })
      .expect(201);
  }

  // ---------------------------------------------------------------------------
  // Happy path — case-insensitive login, stored-casing username returned
  // ---------------------------------------------------------------------------

  it('200 with token and stored-casing username on valid login', async () => {
    await registerUser('Goliath', 'password123');

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      // Login with all-lowercase — should still work
      .send({ username: 'goliath', password: 'password123' })
      .expect(200);

    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    // Returned username must be the stored casing ("Goliath"), not the request casing ("goliath")
    expect(res.body.user.username).toBe('Goliath');
    expect(typeof res.body.user.id).toBe('string');
  });

  // ---------------------------------------------------------------------------
  // Bad credentials → 401
  // ---------------------------------------------------------------------------

  it('401 INVALID_CREDENTIALS on wrong password', async () => {
    await registerUser('SomePlayer', 'password123');

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'SomePlayer', password: 'wrongpassword' })
      .expect(401);

    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('401 INVALID_CREDENTIALS for unknown username', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'NoSuchUser', password: 'password123' })
      .expect(401);

    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  // ---------------------------------------------------------------------------
  // Timing — unknown username must still run bcrypt (constant-time path)
  // ---------------------------------------------------------------------------

  it('unknown username login takes ≥ 100ms (bcrypt constant-time path)', async () => {
    const start = Date.now();

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'GhostUser', password: 'password123' })
      .expect(401);

    const elapsed = Date.now() - start;
    // bcrypt at cost 12 should take well over 100ms; this guards against a
    // fast-path short-circuit that skips the hash comparison for unknown users.
    expect(elapsed).toBeGreaterThanOrEqual(100);
  }, 15000);

  // ---------------------------------------------------------------------------
  // Edge case — user row exists but passwordHash is null
  // ---------------------------------------------------------------------------

  it('401 INVALID_CREDENTIALS when user has null passwordHash', async () => {
    // Insert a User row directly, bypassing the register endpoint, with no hash.
    await prisma.user.create({
      data: {
        userid: 'usr_nullhash_test',
        username: 'NullHashUser',
        passwordHash: null,
        options: [],
      },
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'NullHashUser', password: 'password123' })
      .expect(401);

    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});
