import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';

describe('ShipClassCacheService', () => {
  function makeService(rows: Array<{ classNumber: number; maxAcceleration: number; maxWarp: number }>): ShipClassCacheService {
    const prisma = {
      shipClass: { findMany: vi.fn().mockResolvedValue(rows) },
    } as any;
    return new ShipClassCacheService(prisma);
  }

  it('hydrates from prisma.shipClass.findMany on onModuleInit', async () => {
    const svc = makeService([
      { classNumber: 1, maxAcceleration: 5000, maxWarp: 10 },
      { classNumber: 2, maxAcceleration: 3000, maxWarp: 6 },
    ]);
    await svc.onModuleInit();
    expect(svc.getMaxAcceleration(1)).toBe(5000);
    expect(svc.getMaxWarp(1)).toBe(10);
    expect(svc.getMaxAcceleration(2)).toBe(3000);
    expect(svc.getMaxWarp(2)).toBe(6);
  });

  it('returns synchronously after hydration', async () => {
    const svc = makeService([{ classNumber: 7, maxAcceleration: 1000, maxWarp: 4 }]);
    await svc.onModuleInit();
    // No await — must be sync.
    const v = svc.getMaxAcceleration(7);
    expect(v).toBe(1000);
  });

  it('throws on unknown classNumber', async () => {
    const svc = makeService([{ classNumber: 1, maxAcceleration: 100, maxWarp: 1 }]);
    await svc.onModuleInit();
    expect(() => svc.getMaxAcceleration(99)).toThrow(/ShipClass 99/);
    expect(() => svc.getMaxWarp(99)).toThrow(/ShipClass 99/);
  });

  it('setForTest seam allows tests to seed without Prisma', () => {
    const svc = new ShipClassCacheService({} as any);
    svc.setForTest(42, { maxAcceleration: 2000, maxWarp: 5 });
    expect(svc.getMaxAcceleration(42)).toBe(2000);
    expect(svc.getMaxWarp(42)).toBe(5);
  });
});
