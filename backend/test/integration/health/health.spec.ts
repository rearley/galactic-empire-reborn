/**
 * GET /health — liveness/readiness probe used by the docker-compose healthcheck.
 *
 * docker-compose.yml healthchecks the backend with
 * `wget -qO- http://localhost:3000/health`, so this route must exist and must
 * return 200 while the app can reach Postgres, and 503 when it cannot.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as (app: unknown) => import('supertest').SuperTest<import('supertest').Test>;
import { PrismaService } from '../../../src/prisma/prisma.service';
import { HealthController } from '../../../src/health/health.controller';

describe('GET /health', () => {
  let app: INestApplication;
  const prismaStub = { $queryRaw: jest.fn() };

  async function build(): Promise<void> {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaStub }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  }

  afterEach(async () => {
    if (app) await app.close();
    jest.resetAllMocks();
  });

  it('returns 200 with status ok when Postgres is reachable', async () => {
    prismaStub.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await build();

    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('up');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns 503 with status error when Postgres is unreachable', async () => {
    prismaStub.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await build();

    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.database).toBe('down');
  });

  it('does not require authentication', async () => {
    prismaStub.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await build();

    // No Authorization header supplied — must still succeed.
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
