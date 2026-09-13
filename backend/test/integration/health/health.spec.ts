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
import { PrismaService } from '../../../src/prisma/prisma.service';
import { HealthController } from '../../../src/health/health.controller';
import request from 'supertest';

describe('GET /health', () => {
  let app: INestApplication;
  const prismaStub = { $queryRaw: vi.fn() };

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
    vi.resetAllMocks();
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

  /**
   * The check that would have caught a three-day outage on day one.
   *
   * A dev backend started on 8 September kept running while a migration on the
   * 9th dropped a column its in-memory Prisma client still wrote. Every ship
   * flush failed from that moment — 5,220,711 errors — and every signal a person
   * would look at said the game was fine: /health reported
   * `{"status":"ok","database":"up"}`, because connectivity was never the
   * problem. The database had moved out from under the process.
   *
   * So the probe now records the applied migrations AT BOOT and compares on
   * every call. A migration applied since this process started is exactly the
   * fault, and it is reported as one. @see issue #36
   */
  describe('schema agreement', () => {
    const migrations = (names: string[]) => names.map((migration_name) => ({ migration_name }));

    it('reports the schema current when the database has not moved since boot', async () => {
      prismaStub.$queryRaw.mockResolvedValue(migrations(['20260901_init', '20260908_ships']));
      await build();

      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.schema).toBe('current');
      expect(res.body.migrations).toBe(2);
    });

    it('goes 503 and says the schema moved when a migration lands after boot', async () => {
      prismaStub.$queryRaw.mockResolvedValue(migrations(['20260901_init', '20260908_ships']));
      await build();
      // The 9 September migration, applied while this process runs.
      prismaStub.$queryRaw.mockResolvedValue(
        migrations(['20260901_init', '20260908_ships', '20260909_drop_autoshield']),
      );

      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.schema).toBe('moved');
      // Says what moved, because "moved" alone sends a reader to the logs.
      expect(res.body.schemaDetail).toContain('20260909_drop_autoshield');
    });

    it('notices a ROLLED BACK migration too — any disagreement is a disagreement', async () => {
      prismaStub.$queryRaw.mockResolvedValue(migrations(['20260901_init', '20260908_ships']));
      await build();
      prismaStub.$queryRaw.mockResolvedValue(migrations(['20260901_init']));

      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.schema).toBe('moved');
    });

    it('still reports the database down when it cannot be reached at all', async () => {
      prismaStub.$queryRaw.mockResolvedValue(migrations(['20260901_init']));
      await build();
      prismaStub.$queryRaw.mockRejectedValue(new Error('connection refused'));

      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.database).toBe('down');
    });

    it('does not claim drift when the migration table cannot be read', async () => {
      // A database that answers SELECT 1 but not the migrations table is a
      // different fault, and guessing "moved" would send someone to restart a
      // process that is not the problem.
      prismaStub.$queryRaw.mockRejectedValue(new Error('relation does not exist'));
      await build();
      prismaStub.$queryRaw.mockImplementation((q: unknown) => {
        const text = String((q as { strings?: string[] })?.strings?.join('') ?? q);
        return text.includes('_prisma_migrations')
          ? Promise.reject(new Error('relation does not exist'))
          : Promise.resolve([{ '?column?': 1 }]);
      });

      const res = await request(app.getHttpServer()).get('/health');

      expect(res.body.schema).toBe('unknown');
      expect(res.status).toBe(200);
    });
  });

  it('does not require authentication', async () => {
    prismaStub.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await build();

    // No Authorization header supplied — must still succeed.
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
