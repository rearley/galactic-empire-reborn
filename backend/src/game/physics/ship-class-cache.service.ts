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
export interface ShipClassEntry {
  maxAcceleration: number;
  maxWarp: number;
  maxPhaser: number;
  maxShields: number;
  scanRange: number;
  maxTons: number;
  hasTorpedo: boolean;
  hasMissile: boolean;
  hasJammer: boolean;
  hasMine: boolean;
  hasZipper: boolean;
  hasCloak: boolean;
  hasDecoy: boolean;
  noClaim: number;
  tough: number;
  cybLowestClassAttacks: number;
  /** True if Cybertrons can attack this class on contact (GECYBS.C cybs_can_att). */
  cybCanAttack: boolean;
  /** Score points awarded to attacker on kill. @see GEMAIN.H shipclass[].max_points */
  points: number;
  /** True if this ship class can attack planets (GEMAIN.H shipclass[].max_attk != 0). @see GECMDS.C:3520 */
  canAttackPlanet: boolean;
  /** Per-class damage scaling denominator: multiplier = 100/damageFactor. @see GEFUNCS.C:2661 ton_fact */
  damageFactor: number;
  /** Human-readable ship class name (e.g. "Scout", "Destroyer"). Used in the ship-select menu. */
  typeName: string;
  /** 'PLAYER' | 'CPU_COMBATIVE' | 'CPU_DROID' — canon's `max_type`. */
  category: string;
  /** Canon SNAME: the display-name PREFIX for automatons. @see MBMGESHP.MSG SxxSNAME */
  shipNameTemplate: string;
  /**
   * Wiki "Price" — player purchase price in credits; 0 for CPU ships.
   * Added to the cache for Task 3 of the persistence-boundary restructure so
   * `new ship`'s listing and purchase flow (new-ship.handler.ts) can read the
   * hull price without a per-call `prisma.shipClass` query. Static seed data,
   * same as every other field here — never written at runtime.
   */
  maxPrice: bigint;
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
        maxShields: true,
        scanRange: true,
        maxTons: true,
        maxPrice: true,
        hasTorpedo: true,
        hasMissile: true,
        hasJammer: true,
        hasMine: true,
        hasZipper: true,
        hasCloak: true,
        hasDecoy: true,
        noClaim: true,
        tough: true,
        cybLowestClassAttacks: true,
        cybCanAttack: true,
        points: true,
        canAttackPlanet: true,
        damageFactor: true,
        typeName: true,
        category: true,
        shipNameTemplate: true,
      },
    });
    for (const row of rows) {
      this.cache.set(row.classNumber, {
        maxAcceleration: row.maxAcceleration,
        maxWarp: row.maxWarp,
        maxPhaser: row.maxPhaser,
        maxShields: row.maxShields,
        scanRange: row.scanRange,
        maxTons: row.maxTons,
        maxPrice: row.maxPrice,
        hasTorpedo: row.hasTorpedo,
        hasMissile: row.hasMissile,
        hasJammer: row.hasJammer,
        hasMine: row.hasMine,
        hasZipper: row.hasZipper,
        hasCloak: row.hasCloak,
        hasDecoy: row.hasDecoy,
        noClaim: row.noClaim,
        tough: row.tough,
        cybLowestClassAttacks: row.cybLowestClassAttacks,
        cybCanAttack: row.cybCanAttack,
        points: row.points,
        canAttackPlanet: row.canAttackPlanet,
        damageFactor: row.damageFactor,
        typeName: row.typeName,
        category: row.category,
        shipNameTemplate: row.shipNameTemplate,
      });
    }
    this.logger.log(`Hydrated ${this.cache.size} ship classes`);
  }

  /**
   * Returns the full cache entry for a class, or undefined if not cached.
   * Used by CybertronTickService for AI ship-class resolution.
   * @see specs/007-cybertron-ai/plan.md — per-class field access
   */
  get(classNumber: number): ShipClassEntry | undefined {
    return this.cache.get(classNumber);
  }

  /**
   * Every cached class number, ascending. The command layer used this to
   * validate `sys class <n>` and to enumerate `sys classlist` / `new ship`
   * against the full table — previously done with a fresh
   * `prisma.shipClass.findMany`, now served from the boot-time cache.
   * @see specs — restructure Phase 3 Task 3
   */
  getClassNumbers(): number[] {
    return Array.from(this.cache.keys()).sort((a, b) => a - b);
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getMaxPrice(classNumber: number): bigint {
    return this.entry(classNumber).maxPrice;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getMaxAcceleration(classNumber: number): number {
    return this.entry(classNumber).maxAcceleration;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getMaxShields(classNumber: number): number {
    return this.entry(classNumber).maxShields;
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

  /** Synchronous lookup. Throws if the class is not in the cache. @see GEFUNCS.C:2661 ton_fact */
  getDamageFactor(classNumber: number): number {
    return this.entry(classNumber).damageFactor;
  }

  /**
   * Whether boot hydration has populated the cache.
   *
   * The movement tick runs on the 1-second timer (canon's warrti2a), which can
   * fire before the async hydration in `onModuleInit` completes — the 6-second
   * tick never could. A tick that cannot read ship classes must skip rather
   * than fault every ship in the galaxy.
   */
  isHydrated(): boolean {
    return this.cache.size > 0;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getHasTorpedo(classNumber: number): boolean {
    return this.entry(classNumber).hasTorpedo;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getHasMissile(classNumber: number): boolean {
    return this.entry(classNumber).hasMissile;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. */
  getHasCloak(classNumber: number): boolean {
    return this.entry(classNumber).hasCloak;
  }

  /**
   * Does this hull carry a decoy launcher at all?
   * `if (!shipclass[warsptr->shpclass].has_decoy) { prfmsg(DECOY0); return; }`
   * is the FIRST thing cmd_decoy does (GECMDS.C:1545-1550), and it was missing,
   * so any class could launch decoys it was carrying only as cargo.
   */
  getHasDecoy(classNumber: number): boolean {
    return this.entry(classNumber).hasDecoy;
  }

  /** Synchronous lookup. Throws if the class is not in the cache. @see GEMAIN.H shipclass[].max_points */
  getPoints(classNumber: number): number {
    return this.entry(classNumber).points;
  }

  /**
   * Returns the human-readable class name (e.g. "Scout"), or undefined if
   * the class is not in the cache. Used by the ship-selection menu on login.
   * @see specs/030-multi-ship/task-7-brief.md
   */
  getTypeName(classNumber: number): string | undefined {
    return this.cache.get(classNumber)?.typeName;
  }

  /**
   * 'PLAYER' | 'CPU_COMBATIVE' | 'CPU_DROID' — canon's `max_type`, and the
   * thing that decides WHICH brain a ship runs. Canon binds one tick_func per
   * class at boot (GEMAIN.C:878-895) and calls it by class (:2418-2419), so a
   * droid never runs Cybertron code.
   */
  getCategory(classNumber: number): string | undefined {
    return this.cache.get(classNumber)?.category;
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
      maxShields: 3,
      scanRange: 100000,
      maxTons: 5000,
      maxPrice: 0n,
      hasTorpedo: true,
      hasMissile: true,
      hasJammer: false,
      hasMine: false,
      hasZipper: false,
      hasCloak: false,
      hasDecoy: false,
      noClaim: 3,
      tough: 0,
      cybLowestClassAttacks: 0,
      cybCanAttack: true,
      points: 0,
      canAttackPlanet: true,
      damageFactor: 100,
      typeName: '',
      category: 'PLAYER',
      shipNameTemplate: '',
      ...entry,
    });
  }
}
