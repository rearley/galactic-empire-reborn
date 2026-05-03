import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * In-memory cache of `ShipClass` combat- and physics-relevant fields,
 * hydrated once on boot from Postgres so the physics tick, the warp command,
 * and the combat module can resolve per-class limits synchronously without
 * per-call DB round-trips.
 *
 * The `ShipClass` catalog is static seed data (constitution data model);
 * once hydrated, the cache is never re-fetched.
 *
 * @see GEMAIN.H — shipclass[] table
 * @see specs/006a-physics-tick/research.md R-6
 */
interface ShipClassEntry {
  maxAcceleration: number;
  maxWarp: number;
  maxPhaser: number;
  scanRange: number;
  maxTons: number;
  hasTorpedo: boolean;
  hasMissile: boolean;
}

@Injectable()
export class ShipClassCacheService implements OnModuleInit {
  private readonly logger = new Logger(ShipClassCacheService.name);
  private readonly cache = new Map<number, ShipClassEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.prisma.shipClass.findMany({
      select: {
        classNumber: true,
        maxAcceleration: true,
        maxWarp: true,
        maxPhaser: true,
        scanRange: true,
        maxTons: true,
        hasTorpedo: true,
        hasMissile: true,
      },
    });
    for (const row of rows) {
      this.cache.set(row.classNumber, {
        maxAcceleration: row.maxAcceleration,
        maxWarp: row.maxWarp,
        maxPhaser: row.maxPhaser,
        scanRange: row.scanRange,
        maxTons: row.maxTons,
        hasTorpedo: row.hasTorpedo,
        hasMissile: row.hasMissile,
      });
    }
    this.logger.log(`Hydrated ${this.cache.size} ship classes`);
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getMaxAcceleration(classNumber: number): number {
    return this.entry(classNumber).maxAcceleration;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getMaxWarp(classNumber: number): number {
    return this.entry(classNumber).maxWarp;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getMaxPhaser(classNumber: number): number {
    return this.entry(classNumber).maxPhaser;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getScanRange(classNumber: number): number {
    return this.entry(classNumber).scanRange;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getMaxTons(classNumber: number): number {
    return this.entry(classNumber).maxTons;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getHasTorpedo(classNumber: number): boolean {
    return this.entry(classNumber).hasTorpedo;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getHasMissile(classNumber: number): boolean {
    return this.entry(classNumber).hasMissile;
  }

  private entry(classNumber: number): ShipClassEntry {
    const entry = this.cache.get(classNumber);
    if (!entry) throw new Error(`ShipClass ${classNumber} not in cache`);
    return entry;
  }

  /**
   * Test-only seam for in-memory test setup. Direct-injects an entry into
   * the cache so unit tests can run without booting Prisma. Combat fields
   * (maxPhaser/scanRange/maxTons) default to safe values if omitted, so
   * existing pre-006b physics tests do not need to be updated.
   */
  setForTest(classNumber: number, entry: Partial<ShipClassEntry> & Pick<ShipClassEntry, 'maxAcceleration' | 'maxWarp'>): void {
    this.cache.set(classNumber, {
      maxPhaser: 1000,
      scanRange: 100000,
      maxTons: 5000,
      hasTorpedo: true,
      hasMissile: true,
      ...entry,
    });
  }
}
