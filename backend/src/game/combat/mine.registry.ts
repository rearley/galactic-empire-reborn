import { Injectable } from '@nestjs/common';
import { resolveGameConfig } from '../config/game-config';

/**
 * The galaxy-wide mine budget: the number of slots in the ONE mine table the
 * original allocates for the whole universe.
 *
 *   nummines = numopt(NUMMINES,1,200);                        GEMAIN.C:501
 *   mines = (MINE *)alcmem(n=nummines*sizeof(MINE));          GEMAIN.C:754
 *
 * Every mine operation in the original walks `i<nummines` over that table, so
 * it is a hard ceiling on live mines everywhere, not a per-player one. It is
 * DISTINCT from USRMINES, which caps how many of those slots any one captain
 * may hold (GECMDS.C:1796-1803).
 *
 * Read straight from the resolved config rather than from `../constants`,
 * which does not re-export it. @see GE/REL/MBMGEMSG.MSG NUMMINES default 12.
 */
const NUMMINES: number = resolveGameConfig().NUMMINES;

/**
 * Live in-memory representation of a mine. Hydrated from `MineRepository`
 * on combat-module boot; mutated by the combat tick and persisted back
 * when state changes (deployment, sweep cadence, expiry).
 */
export interface MineState {
  id: number;
  channel: number;
  timer: number;
  xcoord: number;
  ycoord: number;
  deployedBy: string;
}

/**
 * In-memory registry of all active mines. Mirrors the original game's
 * MINE[] array. Source of truth during gameplay; flushed lazily through
 * MineRepository.
 *
 * @see GEMAIN.H MINE struct
 */
@Injectable()
export class MineRegistry {
  private readonly mines = new Map<number, MineState>();

  /**
   * Slots in the table. Fixed at boot exactly as the original's `alcmem` sizing
   * is, so a running game cannot grow its own budget.
   * @see GEMAIN.C:501, GEMAIN.C:754
   */
  readonly capacity: number = NUMMINES;

  /**
   * Replace all entries with the supplied snapshot — used on boot.
   *
   * Deliberately NOT capacity-limited. A sysop who lowers NUMMINES between
   * boots would otherwise silently destroy mines already on the board; the
   * table instead refuses new ones until it drains back under budget.
   */
  hydrate(mines: MineState[]): void {
    this.mines.clear();
    for (const m of mines) this.mines.set(m.id, m);
  }

  /** True when no slot in the table is free — the `return(0)` at GECMDS.C:1818. */
  isFull(): boolean {
    return this.mines.size >= this.capacity;
  }

  /**
   * Claim a slot for a mine. Returns false — and inserts nothing — when the
   * galaxy-wide table is full, mirroring `laymine()` falling off the end of
   * its free-slot scan (GECMDS.C:1805-1818). Updating a mine already in the
   * table is not a new allocation and always succeeds.
   */
  add(mine: MineState): boolean {
    if (!this.mines.has(mine.id) && this.isFull()) return false;
    this.mines.set(mine.id, mine);
    return true;
  }

  remove(id: number): void {
    this.mines.delete(id);
  }

  getAll(): MineState[] {
    return Array.from(this.mines.values());
  }

  /** Decrement every mine's timer by one tick. */
  tickAll(): void {
    for (const m of this.mines.values()) m.timer -= 1;
  }

  /**
   * Mines eligible for sweep evaluation this tick — original game evaluates
   * mine sweep on a `timer % 5 === 0` cadence to amortize the O(N*M) cost.
   *
   * @see GEFUNCS.C:minesweep
   */
  sweepCandidates(): MineState[] {
    return Array.from(this.mines.values()).filter((m) => m.timer % 5 === 0);
  }

  /**
   * Count of live mines deployed by a given user (for per-player cap enforcement).
   * @see GECMDS.C:1722 usermines
   */
  countByDeployer(userid: string): number {
    let count = 0;
    for (const m of this.mines.values()) {
      if (m.deployedBy === userid) count++;
    }
    return count;
  }
}
