import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TickKind } from '../tick/tick.types';
import { TickService } from '../tick/tick.service';
import { ShipState, shipKey } from './ship-state.types';
import { prismaShipToState, stateToPrismaUpdate } from './ship-state.mappers';

/**
 * In-memory source of truth for all active ship state.
 * Hydrated from Postgres on boot; flushed back on every SHIP_UPDATE tick.
 * @see GEMAIN.H WARSHP struct — one entry per ship
 * @see GEMAIN.C main loop (TICKTIME2=1s flush cadence)
 */
@Injectable()
export class ShipStateService implements OnModuleInit {
  private readonly logger = new Logger(ShipStateService.name);
  private readonly map = new Map<string, ShipState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickService: TickService,
  ) {}

  /**
   * Hydrates the in-memory map from Postgres and registers the SHIP_UPDATE flush subscriber.
   * Joins User.teamcode so ShipState.teamcode is populated from boot.
   * @see GEMAIN.C boot sequence — ships loaded before game loop starts
   * @see specs/012-social-commands/data-model.md §ShipState.teamcode
   */
  async onModuleInit(): Promise<void> {
    const rows = await this.prisma.ship.findMany({ include: { user: { select: { teamcode: true } } } });
    for (const row of rows) {
      const state = prismaShipToState(row);
      if (row.user?.teamcode != null) state.teamcode = row.user.teamcode;
      this.map.set(shipKey(state.userid, state.shipno), state);
    }
    this.logger.log(`Hydrated ${this.map.size} ships from Postgres`);

    // Register flush on every SHIP_UPDATE tick (1s cadence)
    this.tickService.subscribe(TickKind.SHIP_UPDATE, () => this.flush());
  }

  /**
   * Returns the active ShipState for a given (userid, shipno), or undefined if not loaded.
   */
  get(userid: string, shipno: number): ShipState | undefined {
    return this.map.get(shipKey(userid, shipno));
  }

  /**
   * Atomically applies a mutation function to a ship's state and marks it dirty.
   * The mutation is applied synchronously; the flush happens on the next SHIP_UPDATE tick.
   * @param userid  Ship owner.
   * @param shipno  Ship number.
   * @param fn      Mutation function — mutates the state object in-place.
   * @returns The mutated state, or undefined if not found.
   */
  mutate(
    userid: string,
    shipno: number,
    fn: (state: ShipState) => void,
  ): ShipState | undefined {
    const state = this.map.get(shipKey(userid, shipno));
    if (!state) return undefined;
    fn(state);
    state.dirty = true;
    return state;
  }

  /**
   * Returns all ships for a given userid, sorted ascending by shipno.
   * Used by GameGateway on handshake to resolve the active ship (FR-030).
   */
  findByUserid(userid: string): ShipState[] {
    const result: ShipState[] = [];
    for (const state of this.map.values()) {
      if (state.userid === userid) result.push(state);
    }
    return result.sort((a, b) => a.shipno - b.shipno);
  }

  /** Returns all ships currently in the in-memory map. */
  findAllShips(): ShipState[] {
    return Array.from(this.map.values());
  }

  /**
   * Finds a ship by name (case-insensitive partial match).
   * Returns the first match, or undefined if none found.
   * @see GECMDS.C:2190 scan_sh — name lookup
   */
  findByName(name: string): ShipState | undefined {
    const lower = name.toLowerCase();
    for (const state of this.map.values()) {
      if (state.shipname.toLowerCase().includes(lower)) return state;
    }
    return undefined;
  }

  /** Returns the number of ships currently in the in-memory map. */
  size(): number {
    return this.map.size;
  }

  /**
   * Inserts or replaces a ShipState in the in-memory map.
   * Used by CybertronRepository.hydrateAll() to load Cybertron ships after
   * ShipStateService.onModuleInit() has already run.
   * @see specs/007-cybertron-ai/plan.md T023 — boot-time hydrate for Cybrg-* rows
   */
  loadShip(state: ShipState): void {
    this.map.set(shipKey(state.userid, state.shipno), state);
  }

  /**
   * Loads a ship into the in-memory map only if not already present.
   * Idempotent — calling multiple times with the same ship has no effect after
   * the first call, and never overwrites existing in-flight state.
   * @see game.gateway.ts handleConnection (US2 returning-player path)
   */
  loadIfAbsent(state: ShipState): void {
    const key = shipKey(state.userid, state.shipno);
    if (!this.map.has(key)) {
      this.map.set(key, state);
    }
  }

  /**
   * Removes a ship from the in-memory map. Used by the combat kill-resolution
   * pass when a ship's `damage >= 100` to prevent further processing on the
   * dead ship in subsequent ticks. Postgres row is left intact so the death
   * is durable; the ship is simply no longer ingame.
   * @see GEFUNCS.C:killem
   */
  removeFromGame(ship: { userid: string; shipno: number }): void {
    this.map.delete(shipKey(ship.userid, ship.shipno));
  }

  /**
   * Flushes all dirty ship states to Postgres. Called on every SHIP_UPDATE tick.
   * Each entry's flush is isolated — one failure does NOT prevent sibling flushes (FR-006).
   * @see GEMAIN.C main loop — tick-driven persistence
   */
  private async flush(): Promise<void> {
    for (const state of this.map.values()) {
      if (state.isEphemeral) continue; // FR-002: Droid ships have no DB row
      if (!state.dirty) continue;
      try {
        await this.prisma.ship.update({
          where: { userid_shipno: { userid: state.userid, shipno: state.shipno } },
          data: stateToPrismaUpdate(state),
        });
        state.dirty = false;
      } catch (err: unknown) {
        this.logger.error(
          `Flush failed for ${shipKey(state.userid, state.shipno)}:`,
          err,
        );
      }
    }
  }
}
