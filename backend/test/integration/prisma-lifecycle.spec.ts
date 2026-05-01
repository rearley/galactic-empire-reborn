import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PrismaService lifecycle', () => {
  describe('happy path — real test DB', () => {
    let app: TestingModule;
    let prisma: PrismaService;
    let closed = false;

    beforeEach(async () => {
      closed = false;
      app = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
      prisma = app.get(PrismaService);
      await app.init();
    });

    afterEach(async () => {
      if (!closed) await app.close();
    });

    it('connects on init — trivial SELECT 1 succeeds', async () => {
      const result = await prisma.$queryRaw<{ '?column?': number }[]>`SELECT 1`;
      expect(result[0]['?column?']).toBe(1);
    });

    it('disconnects on close — $disconnect is called during onModuleDestroy', async () => {
      const disconnectSpy = jest.spyOn(prisma, '$disconnect');
      await app.close();
      closed = true;
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });
  });

  // G3: bogus DATABASE_URL must cause app.init() to reject
  describe('fail-fast on bad connection (G3)', () => {
    it('rejects app.init() with a recognizable error when DATABASE_URL is invalid', async () => {
      const original = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://bad:bad@localhost:1/nonexistent';

      let badApp: TestingModule | null = null;
      try {
        badApp = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
        await expect(badApp.init()).rejects.toThrow();
      } finally {
        process.env.DATABASE_URL = original;
        if (badApp) {
          try { await badApp.close(); } catch { /* already failed to init, ignore */ }
        }
      }
    });
  });
});
