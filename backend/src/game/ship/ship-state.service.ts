import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { TickKind } from '../tick/tick.types';
import { TickService } from '../tick/tick.service';
import { ShipState, shipKey } from './ship-state.types';
import { prismaShipToState, stateToPrismaUpdate } from './ship-state.mappers';
import { MIDNIGHT_COMPLETED } from '../midnight/midnight-events';

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
  /**
   * Timestamp (ms) of the most recent successful flush per ship. Used by the
   * runtime-invariants snapshot to honour the FLUSH_SETTLE_MS window in
   * `inMemoryShipMatchesDb`.
   */
  private readonly lastFlushedAt: Map<string, number> = new Map();

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
    const [rows, classes] = await Promise.all([
      this.prisma.ship.findMany({ include: { user: { select: { teamcode: true, options: true } } } }),
      this.prisma.shipClass.findMany({ select: { classNumber: true, maxWarp: true, maxTons: true } }),
    ]);
    const maxWarpByClass = new Map(classes.map((c) => [c.classNumber, c.maxWarp]));
    const maxTonsByClass = new Map(classes.map((c) => [c.classNumber, c.maxTons]));

    for (const row of rows) {
      const state = prismaShipToState(row);
      if (row.user?.teamcode != null) state.teamcode = row.user.teamcode;
      state.scanNames = (row.user?.options?.[0] ?? 0) === 1;
      state.scanHome = (row.user?.options?.[1] ?? 0) === 1;
      state.scanFull = (row.user?.options?.[2] ?? 0) === 1;
      state.msgFilter = (row.user?.options?.[3] ?? 0) === 1;
      state.maxTons = maxTonsByClass.get(state.shpclass) ?? 1000;
      // Self-heal: topspeed=0 on a warp-capable class means it was never set at creation.
      const classMaxWarp = maxWarpByClass.get(state.shpclass) ?? 0;
      if (state.topspeed === 0 && classMaxWarp > 0) {
        state.topspeed = classMaxWarp;
        state.dirty = true;
      }
      // Self-heal: phasrtype/shieldtype=0 means they were never set at creation — @see GEFUNCS.C:233-234
      if (state.phasrtype === 0) { state.phasrtype = 1; state.dirty = true; }
      if (state.shieldtype === 0) { state.shieldtype = 1; state.dirty = true; }
      this.map.set(shipKey(state.userid, state.shipno), state);
    }
    this.logger.log(`Hydrated ${this.map.size} ships from Postgres`);

    // Register flush on every SHIP_UPDATE tick (1s cadence)
    this.tickService.subscribe(TickKind.SHIP_UPDATE, () => this.flush());

    // Provide the `ships` slice of the invariant snapshot. The shape matches
    // `isShipLike` (shipPersistenceInvariants) — `shipId` + the persisted
    // numeric fields the invariant compares against DB rows.
    // @see backend/src/game/invariants/ship-persistence.invariants.ts
    this.tickService.registerSnapshotProvider('ships', () => this.snapshotShips());
  }

  /**
   * Snapshot of every in-memory ship in the shape consumed by
   * `inMemoryShipMatchesDb` / `noOrphanShipState`. Pure projection — does not
   * mutate the underlying map. Returned array is intentionally a fresh copy.
   */
  private snapshotShips(): ReadonlyArray<{
    shipId: string;
    lastFlushedAt: number;
    xcoord: number;
    ycoord: number;
    energy: number;
    damage: number;
  }> {
    const out: Array<{
      shipId: string;
      lastFlushedAt: number;
      xcoord: number;
      ycoord: number;
      energy: number;
      damage: number;
    }> = [];
    for (const s of this.map.values()) {
      if (s.isEphemeral) continue; // ephemeral ships have no DB row to compare against
      out.push({
        shipId: shipKey(s.userid, s.shipno),
        lastFlushedAt: this.lastFlushedAt.get(shipKey(s.userid, s.shipno)) ?? 0,
        xcoord: s.xcoord,
        ycoord: s.ycoord,
        energy: s.energy,
        damage: s.damage,
      });
    }
    return out;
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
    // Exact match first, then prefix, then substring — mirrors GECMDS.C:2190 scan_sh
    for (const state of this.map.values()) {
      if (state.shipname.toLowerCase() === lower) return state;
    }
    for (const state of this.map.values()) {
      if (state.shipname.toLowerCase().startsWith(lower)) return state;
    }
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
   * Immediately flush a single ship to Postgres then evict it from the in-memory map.
   * Used on clean player disconnect so the saved position/state is current.
   * @see GEMAIN.C:warhupa — gepdb(GEUPDATE) + remove from active list
   */
  async flushAndUnload(userid: string, shipno: number): Promise<void> {
    const state = this.map.get(shipKey(userid, shipno));
    if (!state || state.isEphemeral) return;
    try {
      await this.prisma.ship.update({
        where: { userid_shipno: { userid, shipno } },
        data: stateToPrismaUpdate(state),
      });
      this.lastFlushedAt.set(shipKey(userid, shipno), Date.now());
    } catch (err: unknown) {
      this.logger.error(`flushAndUnload failed for ${shipKey(userid, shipno)}:`, err);
    }
    this.map.delete(shipKey(userid, shipno));
    this.lastFlushedAt.delete(shipKey(userid, shipno));
  }

  /**
   * Re-reads User.teamcode from Postgres for every in-memory ship and updates
   * ShipState.teamcode to match. Called by the MIDNIGHT_COMPLETED event handler
   * so players connected across midnight pick up the post-midnight teamcode
   * (e.g. orphan reset to 0 by countTeamMembersAndResetOrphans).
   *
   * Only teamcode is refreshed here. Other midnight-mutated User fields (e.g.
   * User.score, User.options) that may be cached on ShipState are out of scope —
   * those are either not cached in-memory or are refreshed by other mechanisms.
   *
   * Empty-map case: no-op (skips the DB query entirely).
   *
   * @see src/game/midnight/midnight.repository.ts countTeamMembersAndResetOrphans
   * @see specs/026-subsystem-damage task-4-brief.md P-016
   */
  async refreshTeamcodes(): Promise<void> {
    if (this.map.size === 0) return;

    const allUserids = Array.from(new Set(
      Array.from(this.map.values()).map((s) => s.userid),
    ));

    const rows = await this.prisma.user.findMany({
      where: { userid: { in: allUserids } },
      select: { userid: true, teamcode: true },
    });

    const teamcodeByUserid = new Map<string, bigint | null>();
    for (const row of rows) {
      teamcodeByUserid.set(row.userid, row.teamcode);
    }

    for (const state of this.map.values()) {
      if (!teamcodeByUserid.has(state.userid)) continue;
      const dbTeamcode = teamcodeByUserid.get(state.userid)!;
      // bigint | null from DB → bigint | undefined on ShipState
      state.teamcode = dbTeamcode !== null ? dbTeamcode : undefined;
    }
  }

  /**
   * Listens for MIDNIGHT_COMPLETED and refreshes in-memory teamcodes from DB.
   * Placed on ShipStateService (an already-running singleton) to avoid a
   * separate listener service and prevent any circular-dependency concern —
   * ShipStateService does NOT import MidnightService; it only imports the
   * event constant string, which is a one-way data dependency.
   *
   * @see src/game/midnight/midnight-events.ts MIDNIGHT_COMPLETED
   */
  @OnEvent(MIDNIGHT_COMPLETED)
  async onMidnightCompleted(): Promise<void> {
    this.logger.log('midnight.completed received — refreshing in-memory teamcodes');
    await this.refreshTeamcodes();
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
        this.lastFlushedAt.set(shipKey(state.userid, state.shipno), Date.now());
      } catch (err: unknown) {
        this.logger.error(
          `Flush failed for ${shipKey(state.userid, state.shipno)}:`,
          err,
        );
      }
    }
  }
}
