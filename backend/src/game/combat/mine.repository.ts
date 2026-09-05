import { Injectable, Optional } from '@nestjs/common';
import { Mine } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MineRegistry } from './mine.registry';
import { USERMINES } from '../constants';

/**
 * Base class for the two ways `laymine()` can return 0. Canon draws no
 * distinction between them — both print MINE2 and both leave the mine
 * unspent — so every caller catches this rather than either subclass.
 * @see GECMDS.C:1785-1819
 */
export class MineRefusedError extends Error {}

/**
 * Thrown when the galaxy-wide mine table (NUMMINES slots) has no free entry.
 *
 * The original has no exception to throw: `laymine()` simply returns 0 after
 * its free-slot scan finds nothing (GECMDS.C:1805-1818) and the caller prints
 * MINE2, "The mine launcher is temporarly jammed, Sir!" (GECMDS.C:1779). The
 * important half of that contract is what does NOT happen — the mine is not
 * spent and `cantexit` is not set, because both writes live inside the success
 * branch (GECMDS.C:1809-1814). Refusing here, before the row is written, keeps
 * that property: the caller's post-create side effects never run.
 */
export class MineTableFullError extends MineRefusedError {
  constructor(capacity: number) {
    super(`The galaxy mine table is full (NUMMINES=${capacity})`);
    this.name = 'MineTableFullError';
  }
}

/**
 * Thrown when one layer already holds USRMINES of the table's slots.
 *
 * This cap is the FIRST thing `laymine()` does, above the free-slot scan and
 * below nothing (GECMDS.C:1794-1802) — so it binds every caller of laymine,
 * which is to say players, droids (GEDROIDS.C:512) and Cybertrons
 * (GECYBS.C:315, :632) alike. We had it in the player's command handler only,
 * which left the AI uncapped: a single droid could hold all twelve slots and
 * every captain in the galaxy would meet MINE2. That is the mechanism behind
 * the "does AI mine-laying crowd players out" question in docs/PROGRESS.md.
 */
export class MineLayerCapError extends MineRefusedError {
  constructor(cap: number) {
    super(`This layer already holds ${cap} mines (USRMINES=${cap})`);
    this.name = 'MineLayerCapError';
  }
}

export interface CreateMineInput {
  channel: number;
  timer: number;
  xcoord: number;
  ycoord: number;
  deployedBy: string;
}

/**
 * Persistence boundary for mines. Mines must survive a server restart so the
 * combat tick can re-hydrate the in-memory MineRegistry on boot.
 *
 * @see GECMDS.C:cmd_mine — mine deployment
 * @see GEFUNCS.C:minesweep — mine evaluation
 */
@Injectable()
export class MineRepository {
  constructor(
    private readonly prisma: PrismaService,
    /**
     * Optional so the integration tests that exercise persistence alone can
     * construct the repository with nothing but Prisma; when absent, no
     * galaxy-wide budget is enforced.
     */
    @Optional() private readonly registry?: MineRegistry,
  ) {}

  findAllActive(): Promise<Mine[]> {
    return this.prisma.mine.findMany();
  }

  /**
   * Persist a new mine, refusing when the galaxy-wide table is full.
   *
   * Canon's order matters and is preserved: the per-layer cap is checked
   * before the free-slot scan, so a layer at its cap is refused even when the
   * galaxy table has room.
   *
   * @throws MineLayerCapError when this layer already holds USRMINES mines.
   * @throws MineTableFullError when NUMMINES slots are all occupied.
   * @see GEMAIN.C:501 nummines = numopt(NUMMINES,1,200)
   * @see GECMDS.C:1794-1802 laymine's usermines cap
   * @see GECMDS.C:1805-1818 laymine's free-slot scan
   */
  create(input: CreateMineInput): Promise<Mine> {
    if (this.registry && this.registry.countByDeployer(input.deployedBy) >= USERMINES) {
      return Promise.reject(new MineLayerCapError(USERMINES));
    }
    if (this.registry?.isFull()) {
      return Promise.reject(new MineTableFullError(this.registry.capacity));
    }
    return this.prisma.mine.create({ data: input });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.mine.delete({ where: { id } });
  }
}
