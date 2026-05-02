import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * In-memory cache of `ShipClass.maxAcceleration` and `ShipClass.maxWarp`,
 * hydrated once on boot from Postgres so the physics tick and the warp
 * command can resolve per-class limits synchronously without per-call DB
 * round-trips.
 *
 * The `ShipClass` catalog is static seed data (constitution data model);
 * once hydrated, the cache is never re-fetched.
 *
 * @see GEMAIN.H — shipclass[] table
 * @see specs/006a-physics-tick/research.md R-6
 */
@Injectable()
export class ShipClassCacheService implements OnModuleInit {
  private readonly logger = new Logger(ShipClassCacheService.name);
  private readonly cache = new Map<number, { maxAcceleration: number; maxWarp: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.prisma.shipClass.findMany({
      select: { classNumber: true, maxAcceleration: true, maxWarp: true },
    });
    for (const row of rows) {
      this.cache.set(row.classNumber, {
        maxAcceleration: row.maxAcceleration,
        maxWarp: row.maxWarp,
      });
    }
    this.logger.log(`Hydrated ${this.cache.size} ship classes`);
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getMaxAcceleration(classNumber: number): number {
    const entry = this.cache.get(classNumber);
    if (!entry) throw new Error(`ShipClass ${classNumber} not in cache`);
    return entry.maxAcceleration;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getMaxWarp(classNumber: number): number {
    const entry = this.cache.get(classNumber);
    if (!entry) throw new Error(`ShipClass ${classNumber} not in cache`);
    return entry.maxWarp;
  }

  /**
   * Test-only seam for in-memory test setup. Direct-injects an entry into
   * the cache so unit tests can run without booting Prisma.
   */
  setForTest(classNumber: number, entry: { maxAcceleration: number; maxWarp: number }): void {
    this.cache.set(classNumber, entry);
  }
}
