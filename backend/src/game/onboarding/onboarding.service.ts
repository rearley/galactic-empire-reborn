import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipStateService } from '../ship/ship-state.service';
import { isValidShipName } from './name-validator';
import { prismaShipToState } from '../ship/ship-state.mappers';
import { ShipState } from '../ship/ship-state.types';
import { ENGYMAX } from '../constants';
import { START_CASH, START_CLASS, START_FLUX_PODS } from '../constants/onboarding';

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
  ) {}

  /**
   * Builds the class list payload for prompt:class-list.
   * Only PLAYER category ship classes are included.
   */
  async buildClassListPayload(): Promise<ClassListEntry[]> {
    const classes = await this.prisma.shipClass.findMany({
      where: { category: 'PLAYER' },
      orderBy: { classNumber: 'asc' },
    });
    return classes.map((c) => ({
      classNumber: c.classNumber,
      typeName: c.typeName,
      description: `${c.shipNameTemplate} — Shields:${c.maxShields} Phaser:${c.maxPhaser} Warp:${c.maxWarp}`,
      maxShields: c.maxShields,
      maxPhaser: c.maxPhaser,
      maxWarp: c.maxWarp,
      hasTorpedo: c.hasTorpedo,
      hasMissile: c.hasMissile,
    }));
  }

  /** Returns true if classNumber is a valid PLAYER ship class. */
  async validateClassReply(classNumber: number): Promise<boolean> {
    const cls = await this.prisma.shipClass.findFirst({
      where: { classNumber, category: 'PLAYER' },
    });
    return cls !== null;
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

    // items[I_FLUX=4] = START_FLUX_PODS; all 14 slots initialised to 0n per NUMITEMS=14
    const items: bigint[] = [0n, 0n, 0n, 0n, BigInt(START_FLUX_PODS), 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

    const ship = await this.prisma.ship.create({
      data: {
        userid,
        shipno: 1,
        shipname,
        shpclass: START_CLASS,
        xcoord: spawnX,
        ycoord: spawnY,
        energy: ENGYMAX,
        phasr: 100, // 100% charge — @see GEFUNCS.C:222 initshp
        shield: 0, // shields down at spawn — @see GEFUNCS.C:229 initshp SHIELDDN
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

    await this.prisma.user.update({
      where: { userid },
      data: { cash: START_CASH },
    });

    const state = prismaShipToState(ship);
    this.shipStateService.loadShip(state);
    this.logger.log(`Onboarding complete for ${userid}: ship "${shipname}" class ${START_CLASS}`);
    return state;
  }
}
