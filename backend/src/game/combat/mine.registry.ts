import { Injectable } from '@nestjs/common';

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

  /** Replace all entries with the supplied snapshot — used on boot. */
  hydrate(mines: MineState[]): void {
    this.mines.clear();
    for (const m of mines) this.mines.set(m.id, m);
  }

  add(mine: MineState): void {
    this.mines.set(mine.id, mine);
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
}
