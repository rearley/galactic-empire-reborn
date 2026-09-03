import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { TickKind } from '../tick/tick.types';
import { TickService } from '../tick/tick.service';
import { ShipState, shipKey } from './ship-state.types';
import { prismaShipToState, stateToPrismaUpdate } from './ship-state.mappers';
import { MIDNIGHT_COMPLETED } from '../midnight/midnight-events';
import { GESTAT_AUTO, GESTAT_USER, GESTAT_AVAIL } from '../constants';
import { SHIP_STATUS_ABANDONED } from '../commands/_ship-management-constants';
import { ShipChannelRegistry, NO_CHANNEL } from './ship-channel.registry';

/**
 * In-memory source of truth for all active ship state.
 * Hydrated from Postgres on boot; flushed back on every SHIP_UPDATE tick.
 * @see GEMAIN.H WARSHP struct — one entry per ship
 * @see GEMAIN.C main loop (TICKTIME2=1s flush cadence)
 */
/**
 * Marker in the escalated log line, so an operator (or a log alert) can match
 * on one string rather than on prose.
 */
export const FLUSH_FAILURE_ALARM = 'SHIP FLUSH FAILING';

/** Consecutive all-failed sweeps before the alarm is raised once. */
export const FLUSH_FAILURE_THRESHOLD = 10;

@Injectable()
export class ShipStateService implements OnModuleInit {
  private readonly logger = new Logger(ShipStateService.name);
  /** Consecutive sweeps in which every dirty ship failed to flush. */
  private consecutiveFlushFailures = 0;
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
    // @Optional + default so the many direct `new ShipStateService(...)` calls
    // and the ad-hoc test modules that provide ShipStateService on its own keep
    // working; Nest injects the shared singleton when ShipModule is in play.
    @Optional()
    private readonly channels: ShipChannelRegistry = new ShipChannelRegistry(),
  ) {}

  /** Put a ship in the map and give it a channel. */
  private enter(state: ShipState): void {
    this.map.set(shipKey(state.userid, state.shipno), state);
    state.channel = this.channels.acquire(state.userid, state.shipno);
  }

  /**
   * Take a ship out of the map, free its channel, and scrub every reference to
   * that channel.
   *
   * Channels are recycled, so a stale `lastfired` left pointing at a freed one
   * would silently transfer an old grudge — and its kill credit — to whoever
   * came in next.
   *
   * PORT-ORIGINAL. This used to cite GEFUNCS.C:1224-1225 as canon doing the
   * same on logout; it does not. Those two lines are inside `killem` and clear
   * references to a ship that just DIED, so a corpse cannot award points.
   * `warhupa` scrubs nothing on a clean disconnect (GEMAIN.C:1410-1432) — canon
   * simply lives with the mis-attribution. We do not, because our channel
   * recycling is denser.
   *
   * The cost is narrow and real: a killer who logs off in the same tick as
   * their victim's death becomes unattributable, and the ship-loss mail falls
   * back to "an unknown assailant". @see docs/DECISIONS.md
   */
  private leave(userid: string, shipno: number): void {
    const departing = this.map.get(shipKey(userid, shipno));
    if (departing) departing.channel = undefined;
    this.map.delete(shipKey(userid, shipno));
    const freed = this.channels.release(userid, shipno);
    if (freed === NO_CHANNEL) return;
    for (const s of this.map.values()) {
      if (s.lastfired === freed) s.lastfired = NO_CHANNEL;
    }
  }

  /**
   * Hydrates the in-memory map from Postgres and registers the SHIP_UPDATE flush subscriber.
   * Joins User.teamcode so ShipState.teamcode is populated from boot.
   * @see GEMAIN.C boot sequence — ships loaded before game loop starts
   * @see specs/012-social-commands/data-model.md §ShipState.teamcode
   */
  async onModuleInit(): Promise<void> {
    const [rows, classes] = await Promise.all([
      this.prisma.ship.findMany({ where: { status: GESTAT_AUTO }, include: { user: { select: { teamcode: true, options: true } } } }),
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
      state.maxWarp = maxWarpByClass.get(state.shpclass);
      // Self-heal: topspeed=0 on a warp-capable class means it was never set at creation.
      const classMaxWarp = maxWarpByClass.get(state.shpclass) ?? 0;
      if (state.topspeed === 0 && classMaxWarp > 0) {
        state.topspeed = classMaxWarp;
        state.dirty = true;
      }
      // Self-heal: phasrtype/shieldtype=0 means they were never set at creation — @see GEFUNCS.C:233-234
      if (state.phasrtype === 0) { state.phasrtype = 1; state.dirty = true; }
      if (state.shieldtype === 0) { state.shieldtype = 1; state.dirty = true; }
      this.enter(state);
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
    this.enter(state);
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
      this.enter(state);
    }
  }

  /**
   * Board a player ship: mark as active and load into the live world.
   * Called by GameGateway.handleConnection on the player-ship hydrate path.
   * Sets status to GESTAT_USER so the ship is visible to the physics tick,
   * movement engine (MOVENGUSE gate), and combat system.
   *
   * @see GEMAIN.H:210 GESTAT_USER = 1 — active player ship
   * @see GEMAIN.C main loop — only GESTAT_USER ships debit MOVENGUSE
   * @see specs/030-multi-ship/task-6-brief.md T6
   */
  board(state: ShipState): void {
    state.status = GESTAT_USER;
    state.dirty = true;
    this.enter(state);
    // board/unboard are the sole persisters of ship.status.
    // The tick flush (stateToPrismaUpdate) intentionally strips status — see ship-state.mappers.ts:88.
    // Fire-and-forget: updateMany is a no-op if the row is somehow absent; mirrors unboard's explicit persist.
    void this.prisma.ship.updateMany({
      where: { userid: state.userid, shipno: state.shipno },
      data: { status: GESTAT_USER },
    }).catch((err: Error) => this.logger.error('board status persist failed', err));
  }

  /**
   * Abandon a player ship: mark it abandoned in memory AND in Postgres.
   *
   * `status` is stripped from the per-tick flush (see stateToPrismaUpdate), so
   * setting the field on the live state alone was invisible to the database —
   * a restart re-hydrated the hull as flyable and handed it straight back, and
   * `unboard` overwrote the mark with GESTAT_AVAIL on the way out. Boarding an
   * abandoned hull puts the captain behind the router's abandoned-ship gate
   * with no way to acquire another, so the mark has to be durable.
   *
   * @see specs/013-ship-management/spec.md FR-701, FR-702
   */
  async abandon(userid: string, shipno: number): Promise<void> {
    const state = this.map.get(shipKey(userid, shipno));
    if (state) {
      state.status = SHIP_STATUS_ABANDONED;
      state.destruct = 0;
      state.dirty = true;
    }
    await this.prisma.ship.updateMany({
      where: { userid, shipno },
      data: { status: SHIP_STATUS_ABANDONED },
    });
  }

  /**
   * Unboard a player ship: persist as dormant (GESTAT_AVAIL) and remove from
   * the live world. Called by GameGateway.handleDisconnect on clean (non-kill)
   * disconnect.
   *
   * IMPORTANT: stateToPrismaUpdate intentionally strips `status` from the
   * per-tick flush ("status: set at creation/death only"). This method explicitly
   * persists GESTAT_AVAIL via updateMany (a no-op on 0 rows) so that a
   * logout-after-death (ship row already deleted) does NOT crash with P2025.
   *
   * @see GEMAIN.C:warhupa — ship removed from active list on logout
   * @see GEMAIN.H:209 GESTAT_AVAIL = 0 — dormant/unloaded ship slot
   * @see src/game/ship/ship-state.mappers.ts stateToPrismaUpdate (status excluded)
   * @see specs/030-multi-ship/task-6-brief.md T6
   */
  async unboard(userid: string, shipno: number): Promise<void> {
    const state = this.map.get(shipKey(userid, shipno));
    // An abandoned hull stays abandoned — dormant means "logged out and
    // flyable again", which is exactly what abandon is meant to prevent.
    if (state?.status === SHIP_STATUS_ABANDONED) {
      await this.flushAndUnload(userid, shipno);
      return;
    }
    if (state) {
      state.status = GESTAT_AVAIL;
      state.dirty = true;
    }
    // Explicitly persist dormant status — stateToPrismaUpdate strips status from tick flush.
    // updateMany is a no-op when 0 rows match (ship already deleted by death).
    await this.prisma.ship.updateMany({
      where: { userid, shipno },
      data: { status: GESTAT_AVAIL },
    });
    // Flush remaining dirty state (position, energy, etc.) then evict from map.
    await this.flushAndUnload(userid, shipno);
  }

  /**
   * Removes a ship from the in-memory map. Used by the combat kill-resolution
   * pass when a ship's `damage >= 100` to prevent further processing on the
   * dead ship in subsequent ticks. Postgres row is left intact so the death
   * is durable; the ship is simply no longer ingame.
   * @see GEFUNCS.C:killem
   */
  removeFromGame(ship: { userid: string; shipno: number }): void {
    this.leave(ship.userid, ship.shipno);
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
    this.leave(userid, shipno);
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
    try {
      await this.refreshTeamcodes();
    } catch (err: unknown) {
      this.logger.error('refreshTeamcodes failed after midnight.completed', err as Error);
    }
  }

  /**
   * Flushes all dirty ship states to Postgres. Called on every SHIP_UPDATE tick.
   * Each entry's flush is isolated — one failure does NOT prevent sibling flushes (FR-006).
   * @see GEMAIN.C main loop — tick-driven persistence
   */
  private async flush(): Promise<void> {
    let attempted = 0;
    let failed = 0;
    for (const state of this.map.values()) {
      if (state.isEphemeral) continue; // FR-002: Droid ships have no DB row
      if (!state.dirty) continue;
      attempted++;
      // Clear the flag BEFORE awaiting, and build the payload before that.
      // A ship mutates every physics tick, and clearing `dirty` after the await
      // erased any mutation that landed while the write was in flight: the row
      // kept the position the in-flight update carried, and nothing was queued
      // to correct it. A ship that keeps moving self-heals on its next
      // mutation; one that stops, disconnects or is evicted inside that window
      // persists a stale position. Clearing first is strictly safer — a
      // concurrent mutation re-raises the flag and is picked up next sweep.
      const data = stateToPrismaUpdate(state);
      state.dirty = false;
      try {
        await this.prisma.ship.update({
          where: { userid_shipno: { userid: state.userid, shipno: state.shipno } },
          data,
        });
        this.lastFlushedAt.set(shipKey(state.userid, state.shipno), Date.now());
      } catch (err: unknown) {
        failed++;
        state.dirty = true;
        this.logger.error(
          `Flush failed for ${shipKey(state.userid, state.shipno)}:`,
          err,
        );
      }
    }

    // Per-ship catch is right for a transient fault — a locked row is picked
    // up next sweep. It is exactly wrong for a persistent one: when `channel`
    // was added to ShipState every flush threw, the world ran on memory, and
    // the only trace was one log line among thousands. A run of consecutive
    // all-failed sweeps means the durable store has stopped keeping up, which
    // deserves saying once, loudly, rather than another line of noise.
    if (attempted > 0 && failed === attempted) {
      this.consecutiveFlushFailures++;
      if (this.consecutiveFlushFailures === FLUSH_FAILURE_THRESHOLD) {
        this.logger.error(
          `${FLUSH_FAILURE_ALARM}: ${FLUSH_FAILURE_THRESHOLD} consecutive flush sweeps have failed for every dirty ship — ` +
            'ship state is NOT being persisted and will be lost on restart.',
        );
      }
    } else if (attempted > 0) {
      this.consecutiveFlushFailures = 0;
    }
  }
}
