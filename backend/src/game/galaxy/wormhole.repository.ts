import { Injectable } from '@nestjs/common';
import type { Wormhole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The scattered `prisma.wormhole.*` reads, gathered into one place. Wormholes
 * share the planet slot space in C (`sector.planets[]` holds both,
 * discriminated by `type`), but the port's read models split them, so a
 * wormhole lookup is always its own statement rather than a shared one with
 * planets.
 *
 * @see GEMAIN.H:467 `GALWORM {`
 * @see GECMDS.C:2456 `if (plptr->type == PLTYPE_WORM)`
 */
@Injectable()
export class WormholeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Does `plnum` name a wormhole in this sector? Selects only `plnum` — the
   * caller only ever tests presence.
   * @see GECMDS.C cmd_orbit — orbit.handler.ts isSectorWormhole
   */
  async existsInSector(xsect: number, ysect: number, plnum: number): Promise<boolean> {
    const row = await this.prisma.wormhole.findFirst({
      where: { xsect, ysect, plnum },
      select: { plnum: true },
    });
    return row !== null;
  }

  /**
   * The wormhole occupying slot `plnum` in this sector, if any — position and
   * name only, for the `sca pl <n>` readout.
   * @see GECMDS.C scan_pl — scan-planet.ts findSectorWormhole
   */
  async findSectorWormhole(
    xsect: number,
    ysect: number,
    plnum: number,
  ): Promise<{ xcoord: number; ycoord: number; name: string } | null> {
    return this.prisma.wormhole.findFirst({
      where: { xsect, ysect, plnum },
      select: { xcoord: true, ycoord: true, name: true },
    });
  }

  /**
   * Every VISIBLE wormhole in a sector, plnum and name only — the port's
   * addition to the bare `sca pl` listing (canon's `sca pl` demands an
   * argument, per `cmd_scan`), so a hidden wormhole must stay hidden.
   * @see scan-planet.ts (the `sca pl` no-arg listing)
   */
  async findVisibleInSector(xsect: number, ysect: number): Promise<Array<{ plnum: number; name: string }>> {
    return this.prisma.wormhole.findMany({
      where: { xsect, ysect, visible: 1 },
      select: { plnum: true, name: true },
    });
  }

  /**
   * Every wormhole row, whole-table, no `where` and no `select` — the
   * once-at-boot (or post-idempotency-probe) hydration of GalaxyService's
   * in-memory read model.
   * @see galaxy.service.ts hydrate()
   */
  async findAll(): Promise<Wormhole[]> {
    return this.prisma.wormhole.findMany();
  }
}
