import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
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

describe('POST /auth/register', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    // No app.useGlobalPipes() here: AuthController already applies its own
    // per-route ValidationPipe (with the auth-specific exceptionFactory that
    // classifies failures by field). A global pipe would run first in the
    // pipe chain and throw using the default exceptionFactory before the
    // route pipe ever executes, silently masking the {code: ...} contract
    // this test asserts on. Production (main.ts) never registers a global
    // pipe either, so this also matches what actually ships.
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  }, 15000);

  afterEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it('201 with token and a null username on valid registration — the handle comes in step 2', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'TestUser@Example.com', password: 'password123' })
      .expect(201);

    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    expect(typeof res.body.user.id).toBe('string');
    expect(res.body.user.id.length).toBeGreaterThan(0);
    expect(res.body.user.username).toBeNull();
  });

  it('stores the email lowercased regardless of the case supplied', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'MixedCase@Example.COM', password: 'password123' })
      .expect(201);

    const row = await prisma.user.findFirst({ where: { email: 'mixedcase@example.com' } });
    expect(row).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Validation failures → 400
  // ---------------------------------------------------------------------------

  it('400 INVALID_PASSWORD when password is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'valid@example.com' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_PASSWORD');
  });

  it('400 INVALID_EMAIL when email is not a valid address', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'password123' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_EMAIL');
  });

  it('400 INVALID_PASSWORD when password is too short (7 chars)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'valid@example.com', password: 'short7c' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_PASSWORD');
  });

  // ---------------------------------------------------------------------------
  // Conflict → 409
  // ---------------------------------------------------------------------------

  it('409 EMAIL_TAKEN when registering the same email twice (case-insensitive)', async () => {
    // First registration must succeed
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'Alice@Example.com', password: 'password123' })
      .expect(201);

    // Second registration with different case must conflict
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' })
      .expect(409);

    expect(res.body.code).toBe('EMAIL_TAKEN');
  });
});
