import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { AppModule } from '../../../src/app.module';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

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
    // No app.useGlobalPipes() here — see register.spec.ts for why: it would
    // shadow AuthController's own per-route ValidationPipe (and its
    // field-aware exceptionFactory) with the default one.
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
  async function registerUser(email: string, password: string): Promise<void> {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
  }

  // ---------------------------------------------------------------------------
  // Happy path — case-insensitive login by email
  // ---------------------------------------------------------------------------

  it('200 with token on valid login, case-insensitively', async () => {
    await registerUser('Goliath@Example.com', 'password123');

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      // Login with all-lowercase — should still work
      .send({ email: 'goliath@example.com', password: 'password123' })
      .expect(200);

    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    expect(typeof res.body.user.id).toBe('string');
    // Fresh registration has not chosen a handle yet — step 2 does that.
    expect(res.body.user.username).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Bad credentials → 401
  // ---------------------------------------------------------------------------

  it('401 INVALID_CREDENTIALS on wrong password', async () => {
    await registerUser('SomePlayer@Example.com', 'password123');

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'SomePlayer@Example.com', password: 'wrongpassword' })
      .expect(401);

    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('401 INVALID_CREDENTIALS for unknown email', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nosuchuser@example.com', password: 'password123' })
      .expect(401);

    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  // ---------------------------------------------------------------------------
  // Timing — unknown email must still run bcrypt (constant-time path)
  // ---------------------------------------------------------------------------

  it('unknown email login takes ≥ 100ms (bcrypt constant-time path)', async () => {
    const start = Date.now();

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ghostuser@example.com', password: 'password123' })
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
        email: 'nullhash@example.com',
        username: null,
        passwordHash: null,
        options: [],
      },
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nullhash@example.com', password: 'password123' })
      .expect(401);

    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  // ---------------------------------------------------------------------------
  // A half-registered account (no username yet) must still get a token back
  // ---------------------------------------------------------------------------

  it('200 and a null username for an account that has not finished step 2', async () => {
    await registerUser('HalfDone@Example.com', 'password123');

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'halfdone@example.com', password: 'password123' })
      .expect(200);

    expect(res.body.user.username).toBeNull();
    expect(typeof res.body.token).toBe('string');
  });
});
