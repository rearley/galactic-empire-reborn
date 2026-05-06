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

describe('POST /auth/register', () => {
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

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it('201 with token and user on valid registration', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'TestUser', password: 'password123' })
      .expect(201);

    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    expect(typeof res.body.user.id).toBe('string');
    expect(res.body.user.id.length).toBeGreaterThan(0);
    // Username casing must be preserved exactly as supplied
    expect(res.body.user.username).toBe('TestUser');
  });

  // ---------------------------------------------------------------------------
  // Validation failures → 400
  // ---------------------------------------------------------------------------

  it('400 INVALID_PASSWORD when password is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'ValidUser' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_PASSWORD');
  });

  it('400 INVALID_USERNAME when username is too short (2 chars)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'ab', password: 'password123' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_USERNAME');
  });

  it('400 INVALID_USERNAME when username contains a space', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'bad name', password: 'password123' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_USERNAME');
  });

  it('400 INVALID_PASSWORD when password is too short (7 chars)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'ValidUser', password: 'short7c' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_PASSWORD');
  });

  // ---------------------------------------------------------------------------
  // Conflict → 409
  // ---------------------------------------------------------------------------

  it('409 USERNAME_TAKEN when registering the same username twice (case-insensitive)', async () => {
    // First registration must succeed
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'Alice', password: 'password123' })
      .expect(201);

    // Second registration with different case must conflict
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'alice', password: 'password123' })
      .expect(409);

    expect(res.body.code).toBe('USERNAME_TAKEN');
  });
});
