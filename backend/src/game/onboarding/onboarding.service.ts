import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRepository } from '../player/user.repository';
import { ShipStateService } from '../ship/ship-state.service';
import { rollSpawnPosition } from './spawn-placement';
import { isValidShipName } from './name-validator';
import { prismaShipToState } from '../ship/ship-state.mappers';
import { applySessionProfile } from '../ship/session-profile';
import { ShipState } from '../ship/ship-state.types';
import { ENGYMAX, GESTAT_USER } from '../constants';
import { START_CLASS, START_FLUX_PODS } from '../constants/onboarding';
import { onboardingUserUpdate } from './onboarding-cash';
import { FIRST_CPU_CLASS, isPlayerBuyableClass } from '../ship/buyable-class';

export interface ClassListEntry {
  classNumber: number;
  typeName: string;
  description: string;
  maxShields: number;
  maxPhaser: number;
  maxWarp: number;
  hasTorpedo: boolean;
  hasMissile: boolean;
}

export class SpawnSectorMissingError extends Error {
  constructor(x: number, y: number) {
    super(`Spawn sector (${x},${y}) not found in galaxy`);
    this.name = 'SpawnSectorMissingError';
  }
}

/**
 * Drives the server-side multi-step onboarding prompt flow (cmd_new).
 * @see GECMDS.C:4534 — cmd_new implementation
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shipStateService: ShipStateService,
    private readonly config: ConfigService,
    /**
     * The `User` repository. `@Optional()` with a default built over the same
     * client this class already holds, so the suite's direct
     * `new OnboardingService(...)` sites keep compiling — and keep asserting
     * on the very same `prisma.user.*` calls, which is what proves the queries
     * did not change when they moved behind it. Nest injects the shared
     * provider in production. Safe ONLY because `UserRepository` is stateless
     * and constructible from `(prisma)` alone — see the statelessness note on
     * that class before adding a field or a constructor parameter to it.
     */
    @Optional()
    private readonly users: UserRepository = new UserRepository(prisma),
  ) {}

  /**
   * Builds the class list payload for prompt:class-list.
   *
   * PLAYER category AND below cyb_class — both halves of the rule, from the
   * one predicate `new ship` uses. Category alone is what advertised the
   * Sysopian Death Star to every pilot. @see src/game/ship/buyable-class.ts
   */
  async buildClassListPayload(): Promise<ClassListEntry[]> {
    const classes = await this.prisma.shipClass.findMany({
      where: { category: 'PLAYER', classNumber: { lt: FIRST_CPU_CLASS } },
      orderBy: { classNumber: 'asc' },
    });
    return classes.map((c) => ({
      classNumber: c.classNumber,
      typeName: c.typeName,
      // typeName, not shipNameTemplate: canon leaves SNAME empty for USER
      // classes because the player names their own ship. SNAME is a display
      // PREFIX for automatons only. @see MBMGESHP.MSG S01SNAME {}
      description: `${c.typeName} — Shields:${c.maxShields} Phaser:${c.maxPhaser} Warp:${c.maxWarp}`,
      maxShields: c.maxShields,
      maxPhaser: c.maxPhaser,
      maxWarp: c.maxWarp,
      hasTorpedo: c.hasTorpedo,
      hasMissile: c.hasMissile,
    }));
  }

  /**
   * Returns true if classNumber is one a player may actually buy.
   * @see src/game/ship/buyable-class.ts — the bound, and why it is not
   *   category alone.
   */
  async validateClassReply(classNumber: number): Promise<boolean> {
    const cls = await this.prisma.shipClass.findFirst({
      where: { classNumber },
      select: { classNumber: true, category: true },
    });
    return isPlayerBuyableClass(cls);
  }

  /**
   * Returns true if name passes format validation.
   * @see GECMDS.C:5002 — 1-19 printable ASCII
   */
  validateNameReply(name: string): boolean {
    return isValidShipName(name);
  }

  /**
   * Finalizes onboarding: creates Ship row with starting loadout, sets User.cash,
   * loads ship into ShipStateService.
   * Returns the created ShipState — caller registers it in ConnectedShipsRegistry.
   *
   * Throws SpawnSectorMissingError if spawn sector is absent (fail-fast, FR-007).
   * Lets Prisma constraint errors propagate — caller disambiguates by constraint name.
   *
   * @see GEFUNCS.C:initshp — ship initialisation (class 1, 3 flux pods, ENGYMAX)
   * @see GEMAIN.C:521 STRTCASH — starting credits (5000)
   */
  async finalize(userid: string, shipname: string): Promise<ShipState> {
    const spawnX = this.config.get<number>('SPAWN_SECTOR_X', 0);
    const spawnY = this.config.get<number>('SPAWN_SECTOR_Y', 0);

    // Fail-fast if spawn sector doesn't exist (FR-007)
    const spawnSector = await this.prisma.sector.findUnique({
      where: { xsect_ysect: { xsect: spawnX, ysect: spawnY } },
    });
    if (!spawnSector) {
      throw new SpawnSectorMissingError(spawnX, spawnY);
    }

    // C places a new ship at a random point inside the neutral sector, clear of
    // its planets, facing a random heading (GEFUNCS.C:195-217). Spawning every
    // pilot on the sector's exact corner facing 0 put them all on one point and
    // one wrong turn from wrapping out of the neutral zone into Cybertron space.
    const spawnPlanets = await this.prisma.planet.findMany({
      where: { xsect: spawnX, ysect: spawnY },
      select: { xcoord: true, ycoord: true },
    });
    const placement = rollSpawnPosition({ x: spawnX, y: spawnY }, spawnPlanets, Math.random);

    // items[I_FLUX=4] = START_FLUX_PODS; all 14 slots initialised to 0n per NUMITEMS=14
    const items: bigint[] = [0n, 0n, 0n, 0n, BigInt(START_FLUX_PODS), 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

    // Topspeed = class maxWarp — set at creation, reduced by engine damage in combat
    const shipClass = await this.prisma.shipClass.findUnique({ where: { classNumber: START_CLASS } });
    const topspeed = shipClass?.maxWarp ?? 10;

    // Allocate a monotonic ship number — never reuse after deletion. This path also
    // serves the empty-fleet rebuild (a player who lost their whole fleet claiming a
    // free starter): a wiped player with topshipno=5 must get shipno 6, NOT a reset
    // to 1, preserving the never-reuse invariant. Brand-new player (topshipno 0) → 1.
    const topshipno = (await this.users.getTopshipno(userid)) ?? 0;
    const newShipno = topshipno + 1;

    const ship = await this.prisma.ship.create({
      data: {
        userid,
        shipno: newShipno,
        shipname,
        shpclass: START_CLASS,
        xcoord: placement.xcoord,
        ycoord: placement.ycoord,
        heading: placement.heading,
        head2b: placement.heading,
        energy: ENGYMAX,
        status: GESTAT_USER, // active player ship @see GEMAIN.H:210
        topspeed,
        phasr: 100,      // 100% charge — @see GEFUNCS.C:222 initshp
        phasrtype: 1,   // basic phasors fitted at creation — @see GEFUNCS.C:234 initshp
        shield: 0,      // shields down at spawn — @see GEFUNCS.C:229 initshp SHIELDDN
        shieldtype: 1,  // standard shields fitted at creation — @see GEFUNCS.C:233 initshp
        ltorpsChannel: [],
        ltorpsDistance: [],
        lmisslChannel: [],
        lmisslDistance: [],
        lmisslEnergy: [],
        decout: [],
        freq: [0, 0, 0],
        items,
      } as never,
    });

    // Cash is granted only on a captain's FIRST hull. This path also serves
    // the empty-fleet rebuild, so setting it unconditionally wiped a banked
    // balance down to the stipend when someone lost their last ship — and
    // topped a bankrupt captain back up to it. C leaves the bank alone here
    // (GEFUNCS.C:106-113). @see onboarding-cash.ts
    await this.users.applyOnboardingGrant(userid, onboardingUserUpdate(topshipno, newShipno));

    const state = prismaShipToState(ship);
    // The captain's handle, team, kills and option flags. Without this the new
    // hull enters the galaxy anonymous and `displayName()` falls back to the
    // synthetic account key — which is what a brand-new player's first session
    // broadcast on 2026-09-15. @see ship/session-profile.ts
    //
    // Swallowed, not thrown: the Ship row is already written by this point, so
    // a hiccup here must not abort finalize and strand a hull that exists in
    // Postgres but never reached the map. Boarding re-hydrates on the next
    // connection.
    try {
      applySessionProfile(state, await this.users.getSessionProfile(userid));
    } catch (err) {
      this.logger.warn(`Could not hydrate session profile for ${userid}: ${String(err)}`);
    }
    this.shipStateService.loadShip(state);
    this.logger.log(`Onboarding complete for ${userid}: ship "${shipname}" class ${START_CLASS}`);
    return state;
  }
}
