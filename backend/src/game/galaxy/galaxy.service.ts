import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Planet, Prisma, Wormhole, GalaxyMeta } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MAXX, MAXY, SECTYPE_NORMAL, PLTYPE_PLNT, PLTYPE_WORM } from '../constants';
import { loadGalaxyConfig } from './galaxy.config';
import { Rng } from './rng';
import { S00, S00_PLNUM } from './s00';
import { GalaxyConfig } from './galaxy.types';

/**
 * Galaxy generator and in-memory read model.
 *
 * On first boot: generates the full 30×15 galaxy atomically inside one
 * Postgres transaction and writes GalaxyMeta as the last row.
 * On subsequent boots: detects the GalaxyMeta row, skips generation,
 * and hydrates the in-memory cache from Prisma.
 *
 * @see GEPLANET.C:455-650 xgetsector — procedural sector generation
 * @see specs/004-galaxy-generator/contracts/galaxy-service.md
 */
@Injectable()
export class GalaxyService implements OnModuleInit {
  private readonly logger = new Logger(GalaxyService.name);

  private planetsBySector = new Map<string, Planet[]>();
  private wormholesBySector = new Map<string, Wormhole[]>();
  private planetsByName = new Map<string, Planet>();
  private _meta: GalaxyMeta | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Boot lifecycle:
   * 1. Load and validate GalaxyConfig from env.
   * 2. Open a single Postgres transaction.
   * 3. If GalaxyMeta exists → no-op; else run full generation ending with
   *    INSERT INTO GalaxyMeta as the last write of the transaction.
   * 4. Hydrate the in-memory read model from the now-guaranteed tables.
   * 5. Emit the FR-013 summary log line.
   */
  async onModuleInit(): Promise<void> {
    const cfg = loadGalaxyConfig(process.env);
    const startMs = Date.now();

    let generated = false;

    await this.prisma.$transaction(async (tx) => {
      const existingMeta = await tx.galaxyMeta.findFirst();

      if (existingMeta) {
        // Idempotent boot — check for config divergence (T032)
        this.warnOnDivergence(cfg, existingMeta);
        return;
      }

      // Fresh DB — generate the galaxy
      await this.runGeneration(tx, cfg);
      generated = true;
    });

    await this.hydrate();
    const ms = Date.now() - startMs;
    const meta = await this.prisma.galaxyMeta.findFirst();
    if (meta) this._meta = meta;

    const planetCount = this.planetsBySector.size > 0
      ? Array.from(this.planetsBySector.values()).reduce((acc, arr) => acc + arr.length, 0)
      : 0;
    const wormholeCount = this.wormholesBySector.size > 0
      ? Array.from(this.wormholesBySector.values()).reduce((acc, arr) => acc + arr.length, 0)
      : 0;

    // FR-013: single greppable boot-summary line
    // @see specs/004-galaxy-generator/research.md Decision 11
    this.logger.log(
      `galaxy ready — seed=${meta?.seed ?? cfg.seed} plodds=${meta?.plodds ?? cfg.plodds} ` +
      `wormodds=${meta?.wormodds ?? cfg.wormodds} maxplanets=${meta?.maxplanets ?? cfg.maxplanets} ` +
      `sectors=450 planets=${planetCount} wormholes=${wormholeCount} ` +
      `generated=${generated} ms=${ms}`,
    );
  }

  // ─── Read model ────────────────────────────────────────────────────────────

  /**
   * All planets in the given sector. Empty array if none. O(1).
   * @throws if coords are out of range (programmer error)
   */
  getSectorPlanets(xsect: number, ysect: number): readonly Planet[] {
    if (xsect < 0 || xsect >= MAXX || ysect < 0 || ysect >= MAXY) {
      throw new Error(`getSectorPlanets: out-of-range coords (${xsect}, ${ysect})`);
    }
    return this.planetsBySector.get(`${xsect},${ysect}`) ?? [];
  }

  /**
   * All wormholes in the given sector. Empty array if none. O(1).
   * @throws if coords are out of range (programmer error)
   */
  getSectorWormholes(xsect: number, ysect: number): readonly Wormhole[] {
    if (xsect < 0 || xsect >= MAXX || ysect < 0 || ysect >= MAXY) {
      throw new Error(`getSectorWormholes: out-of-range coords (${xsect}, ${ysect})`);
    }
    return this.wormholesBySector.get(`${xsect},${ysect}`) ?? [];
  }

  /**
   * Case-insensitive planet name lookup. Only named (neutral-zone) planets.
   * Returns null for unknown names or non-origin unnamed planets.
   * @see GECMDS.C:2295 (deviation: named lookup, not numeric plnum — research.md Decision 8)
   */
  findPlanetByName(name: string): Planet | null {
    return this.planetsByName.get(name.toLowerCase()) ?? null;
  }

  /**
   * Structural clone of the live GalaxyMeta row.
   * Stable for the lifetime of the process.
   */
  getMeta(): GalaxyMeta {
    if (!this._meta) throw new Error('GalaxyService not yet initialized');
    return { ...this._meta };
  }

  // ─── Private: generation ───────────────────────────────────────────────────

  /**
   * Full galaxy generation inside an open transaction.
   * Visits sectors in row-major order with (0,0) first.
   * @see GEPLANET.C:455-650 xgetsector
   * @see specs/004-galaxy-generator/research.md Decision 6 (iteration order)
   */
  private async runGeneration(
    tx: Prisma.TransactionClient,
    cfg: GalaxyConfig,
  ): Promise<void> {
    const rng = new Rng(cfg.seed);

    // Origin sector (0,0) — hand-authored s00 fixture
    await this.generateOrigin(tx, rng);

    // All remaining sectors in row-major y,x order
    // @see specs/004-galaxy-generator/research.md Decision 6
    for (let y = 0; y < MAXY; y++) {
      for (let x = 0; x < MAXX; x++) {
        if (x === 0 && y === 0) continue; // already done
        await this.generateSector(tx, rng, x, y, cfg);
      }
    }

    // GalaxyMeta is the LAST write — its presence is the atomicity signal
    await tx.galaxyMeta.create({
      data: {
        id: 1,
        seed: BigInt(cfg.seed),
        plodds: cfg.plodds,
        wormodds: cfg.wormodds,
        maxplanets: cfg.maxplanets,
      },
    });
  }

  /**
   * Insert the origin sector (0,0) from the frozen s00 fixture.
   * @see GEPLANET.C:670-727 build_plan_1
   */
  private async generateOrigin(
    tx: Prisma.TransactionClient,
    _rng: Rng,
  ): Promise<void> {
    await tx.sector.create({
      data: { xsect: 0, ysect: 0, plnum: 0, type: SECTYPE_NORMAL, numplan: S00_PLNUM },
    });

    for (let i = 0; i < S00.length; i++) {
      const entry = S00[i];
      const plnum = i + 1;
      const xcoord = 0 + entry.xcoord;
      const ycoord = 0 + entry.ycoord;

      await tx.planet.create({
        data: {
          xsect: 0,
          ysect: 0,
          plnum,
          type: PLTYPE_PLNT,
          xcoord,
          ycoord,
          userid: entry.owner === '' ? null : entry.owner,
          name: entry.name,
          enviorn: entry.env,
          resource: entry.res,
          cash: BigInt(0),
          debt: BigInt(0),
          tax: BigInt(0),
          taxrate: 0,
          warnings: 0,
          password: 'none',
          lastattack: '',
          beacon: '',
          spyowner: '',
          technology: 0,
          teamcode: BigInt(0),
          itemsQty: [],
          itemsRate: [],
          itemsSell: [],
          itemsReserve: [],
          itemsMarkup2a: [],
          itemsSold2a: [],
        },
      });
    }
  }

  /**
   * Insert a non-origin sector with randomized planets/wormholes.
   * @see GEPLANET.C:484-651 xgetsector (non-origin path)
   */
  private async generateSector(
    tx: Prisma.TransactionClient,
    rng: Rng,
    x: number,
    y: number,
    cfg: GalaxyConfig,
  ): Promise<void> {
    // gernd()%plodds==0 triggers planet placement — GEPLANET.C:484
    if (rng.intBelow(cfg.plodds) !== 0) {
      // No objects in this sector
      await tx.sector.create({
        data: { xsect: x, ysect: y, plnum: 0, type: SECTYPE_NORMAL, numplan: 0 },
      });
      return;
    }

    // gernd()%maxplanets gives slot count (may be 0) — GEPLANET.C:485
    const slotCount = rng.intBelow(cfg.maxplanets);

    if (slotCount === 0) {
      await tx.sector.create({
        data: { xsect: x, ysect: y, plnum: 0, type: SECTYPE_NORMAL, numplan: 0 },
      });
      return;
    }

    await tx.sector.create({
      data: { xsect: x, ysect: y, plnum: 0, type: SECTYPE_NORMAL, numplan: slotCount },
    });

    // Track placed coords for peer-distance check
    const placedCoords: Array<{ xcoord: number; ycoord: number }> = [];

    for (let i = 0; i < slotCount; i++) {
      const plnum = i + 1;

      // gernd()%wormodds==0 → wormhole; else planet — GEPLANET.C:548-551
      if (rng.intBelow(cfg.wormodds) === 0) {
        // Wormhole placement — GEPLANET.C:548
        const { xcoord, ycoord } = this.sampleCoord(rng, x, y, placedCoords);
        placedCoords.push({ xcoord, ycoord });

        // Wormhole destination — grid-bounded, no self-loop
        // @see specs/004-galaxy-generator/research.md Decision 5
        let destX: number, destY: number;
        do {
          destX = Math.floor(rng.next() * MAXX);
          destY = Math.floor(rng.next() * MAXY);
        } while (destX === x && destY === y);

        await tx.wormhole.create({
          data: {
            xsect: x,
            ysect: y,
            plnum,
            type: PLTYPE_WORM,
            xcoord,
            ycoord,
            visible: 1,
            destXcoord: destX + 0.5,
            destYcoord: destY + 0.5,
            name: '',
          },
        });
      } else {
        // Planet placement — GEPLANET.C:579-631
        const { xcoord, ycoord } = this.sampleCoord(rng, x, y, placedCoords);
        placedCoords.push({ xcoord, ycoord });

        const enviorn = Math.floor(rng.next() * 4);
        const resource = Math.floor(rng.next() * 4);

        await tx.planet.create({
          data: {
            xsect: x,
            ysect: y,
            plnum,
            type: PLTYPE_PLNT,
            xcoord,
            ycoord,
            userid: null,
            name: '',
            enviorn,
            resource,
            cash: BigInt(0),
            debt: BigInt(0),
            tax: BigInt(0),
            taxrate: 0,
            warnings: 0,
            password: 'none',
            lastattack: '',
            beacon: '',
            spyowner: '',
            technology: 0,
            teamcode: BigInt(0),
            itemsQty: [],
            itemsRate: [],
            itemsSell: [],
            itemsReserve: [],
            itemsMarkup2a: [],
            itemsSold2a: [],
          },
        });
      }
    }
  }

  /**
   * Sample a (xcoord, ycoord) within the sector cell, retrying until
   * peer-distance ≥ 0.07 from all already-placed objects.
   * @see GEPLANET.C:579-595 placement with distance check
   */
  private sampleCoord(
    rng: Rng,
    x: number,
    y: number,
    peers: Array<{ xcoord: number; ycoord: number }>,
  ): { xcoord: number; ycoord: number } {
    let xcoord: number;
    let ycoord: number;
    let attempts = 0;
    do {
      xcoord = x + rng.next() * 0.8 + 0.1;
      ycoord = y + rng.next() * 0.8 + 0.1;
      attempts++;
      // Safety cap — avoids infinite loop in degenerate seeds
      if (attempts > 100) break;
    } while (
      peers.some(
        (p) =>
          Math.sqrt(Math.pow(p.xcoord - xcoord, 2) + Math.pow(p.ycoord - ycoord, 2)) < 0.07,
      )
    );
    return { xcoord, ycoord };
  }

  // ─── Private: read-model hydration ─────────────────────────────────────────

  /**
   * Load all planets and wormholes from Postgres into the in-memory read model.
   * Called once after generation (or after idempotency probe finds an existing world).
   * @see specs/004-galaxy-generator/research.md Decision 7
   */
  private async hydrate(): Promise<void> {
    const [planets, wormholes] = await Promise.all([
      this.prisma.planet.findMany(),
      this.prisma.wormhole.findMany(),
    ]);

    this.planetsBySector.clear();
    this.wormholesBySector.clear();
    this.planetsByName.clear();

    for (const planet of planets) {
      const key = `${planet.xsect},${planet.ysect}`;
      const arr = this.planetsBySector.get(key);
      if (arr) {
        arr.push(planet);
      } else {
        this.planetsBySector.set(key, [planet]);
      }

      if (planet.name) {
        this.planetsByName.set(planet.name.toLowerCase(), planet);
      }
    }

    for (const wormhole of wormholes) {
      const key = `${wormhole.xsect},${wormhole.ysect}`;
      const arr = this.wormholesBySector.get(key);
      if (arr) {
        arr.push(wormhole);
      } else {
        this.wormholesBySector.set(key, [wormhole]);
      }
    }
  }

  // ─── Private: divergence warning ───────────────────────────────────────────

  /**
   * On an idempotent boot, warn if env config diverges from persisted GalaxyMeta.
   * The persisted values remain authoritative — this is informational only.
   * @see specs/004-galaxy-generator/research.md Decision 3 (config surface)
   */
  private warnOnDivergence(cfg: GalaxyConfig, meta: GalaxyMeta): void {
    const mismatches: string[] = [];

    if (BigInt(cfg.seed) !== meta.seed) {
      mismatches.push(`seed: env=${cfg.seed} persisted=${meta.seed}`);
    }
    if (cfg.plodds !== meta.plodds) {
      mismatches.push(`plodds: env=${cfg.plodds} persisted=${meta.plodds}`);
    }
    if (cfg.wormodds !== meta.wormodds) {
      mismatches.push(`wormodds: env=${cfg.wormodds} persisted=${meta.wormodds}`);
    }
    if (cfg.maxplanets !== meta.maxplanets) {
      mismatches.push(`maxplanets: env=${cfg.maxplanets} persisted=${meta.maxplanets}`);
    }

    if (mismatches.length > 0) {
      this.logger.warn(
        `WARN: env config diverges from persisted GalaxyMeta — ${mismatches.join(', ')}. ` +
        `Persisted values are authoritative; live world unchanged.`,
      );
    }
  }
}
