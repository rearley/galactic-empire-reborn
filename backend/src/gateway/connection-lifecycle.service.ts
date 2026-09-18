import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Ship } from '../prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipStateService } from '../game/ship/ship-state.service';
import { ShipClassCacheService } from '../game/physics/ship-class-cache.service';
import { ScanHandlerService } from '../game/commands/handlers/scan.handler';
import { PresenceService } from '../public/presence.service';
import { WsAuthGuard } from '../auth/ws-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UserRepository } from '../game/player/user.repository';
import { ConnectedShipsRegistry, ConnectedPlayer } from './connected-ships.registry';
import { DisconnectTelemetryService } from './disconnect-telemetry.service';
import { applySessionProfile } from '../game/ship/session-profile';
import { GESTAT_USER, MAXPLRS, MAIL_CLASS_DISTRESS } from '../game/constants';
import { shipKey, ShipState } from '../game/ship/ship-state.types';
import { SHIP_STATUS_ABANDONED } from '../game/commands/_ship-management-constants';
import { RANDOM, Random } from '../game/combat/random.port';
import { scopePlayers } from './player-visibility';
import { capSocketsForUser, MAX_SOCKETS_PER_USER } from './socket-cap';
import { formatMessage, MessageId } from '../game/commands/messages';
import { attackerNameFromLastFired, resolveKillSpoils } from '../game/combat/kill-resolution';
import { MESG_SHIPLOSS } from '../game/player/ship-loss-mail.service';
import { COMBAT_SHIP_DESTROYED, CombatShipDestroyedEvent } from '../game/combat/combat-events';
import type {
  GameServer,
  GameSocket,
  GatewayError,
  OnboardingState,
  PendingShipSelectEntry,
} from './types';

/**
 * What the connection lifecycle needs of the gateway, and nothing else.
 *
 * The service holds no `Server` of its own: `@WebSocketServer()` populates
 * `GameGateway.server` after construction, and several specs swap that double
 * between calls, so the live server has to be read through the gateway rather
 * than captured. `log` / `error` go to the GATEWAY's logger so every line this
 * region has ever printed keeps coming out under the same context.
 */
export interface LifecycleHost {
  readonly server: GameServer;
  log(message: string): void;
  error(message: string, err: unknown): void;
}

/**
 * Connection, ship entry, boarding and disconnect — the most stateful region of
 * the gateway, and the one that decides whether dropping a connection costs a
 * player their hull.
 *
 * This was `GameGateway.handleConnection` through `handleDisconnect`. The
 * gateway keeps the `OnGatewayConnection` / `OnGatewayDisconnect` decorators
 * and delegates; the per-account socket map and `CLIENT_SIDE_REASONS` moved
 * here with the code that reads them.
 */
@Injectable()
export class ConnectionLifecycleService {
  /**
   * Authenticated socket ids per account, oldest first. Bounded by
   * MAX_SOCKETS_PER_USER on insert and pruned on disconnect, so it cannot grow
   * with connection churn. @see gateway/socket-cap.ts
   */
  private readonly socketsByUser = new Map<string, string[]>();

  /**
   * Disconnect reasons produced by the CLIENT (browser drop, timeout).
   * Server-side reasons ('server namespace disconnect', 'server shutting down')
   * are NOT in this set and must never trigger the combat-kill.
   *
   * Note: 'transport error' (transient network blips) IS included here.
   * A brief reconnect hiccup mid-combat is treated as a rage-quit — an accepted
   * tradeoff matching the C anti-rage-quit intent (@see GEMAIN.C:warhupa line 1397).
   */
  private static readonly CLIENT_SIDE_REASONS = new Set([
    'transport close',
    'transport error',
    'ping timeout',
    'client namespace disconnect',
  ]);

  constructor(
    private readonly shipStateService: ShipStateService,
    private readonly registry: ConnectedShipsRegistry,
    private readonly wsAuthGuard: WsAuthGuard,
    private readonly prisma: PrismaService,
    private readonly scanHandler: ScanHandlerService,
    private readonly shipClassCache: ShipClassCacheService,
    @Inject(RANDOM) private readonly random: Random,
    private readonly events: EventEmitter2,
    private readonly presence: PresenceService,
    /**
     * The `User` repository. `@Optional()` with a default built over the same
     * client this class already holds, so the suite's direct
     * `new ConnectionLifecycleService(...)` sites keep compiling — and keep asserting
     * on the very same `prisma.user.*` calls, which is what proves the queries
     * did not change when they moved behind it. Nest injects the shared
     * provider in production. Safe ONLY because `UserRepository` is stateless
     * and constructible from `(prisma)` alone — see the statelessness note on
     * that class before adding a field or a constructor parameter to it.
     */
    @Optional()
    private readonly users: UserRepository = new UserRepository(prisma),
    /**
     * Diagnostic only — see DisconnectTelemetryService. `@Optional()` with a
     * default for the same reason `users` has one: the suite constructs this
     * class directly in a dozen places, and none of them should have to know
     * about a table nothing reads.
     */
    @Optional()
    private readonly telemetry: DisconnectTelemetryService = new DisconnectTelemetryService(prisma),
  ) {}

  /**
   * On connection: validate JWT, resolve ship(s), emit welcome or onboarding prompt.
   *
   * Mirrors C `lookupshp` count-branch:
   *   0 ships → new-player onboarding
   *   1 ship  → auto-board (existing returning-player path)
   *   >1 ship → emit `prompt:ship-select` menu; wait for `prompt:reply`
   *
   * @see specs/011-onboarding/contracts/websocket-events.md §Connection
   * @see specs/030-multi-ship/task-7-brief.md T7
   */
  async onConnect(host: LifecycleHost, client: GameSocket): Promise<void> {
    host.log(`connection ${client.id}`);

    // Capture disconnect reason so handleDisconnect can distinguish client-side
    // drops (transport close, ping timeout) from server-side causes (hot reload,
    // server.disconnect()). Only client-side drops trigger the cantexit combat kill.
    client.on('disconnect', (reason: string) => {
      client.data.disconnectReason = reason;
    });

    // Step 1: Validate JWT
    const payload = await this.wsAuthGuard.validate(client);
    if (!payload) return; // already disconnected by guard

    const userid = payload.sub;
    client.data.userid = userid;

    // Close any open disconnect row now, on AUTH rather than on boarding: a
    // player who reconnects and stops at the ship-select prompt has still come
    // back, and measuring only those who reboard would bias the gap percentiles
    // downward. Diagnostic only; cannot throw. @see DisconnectTelemetryService
    await this.telemetry.recordReturn(userid);
    client.data.username = payload.username;
    this.presence.arrive(userid);

    // Cap simultaneous sockets per ACCOUNT. The MAXPLRS gate below counts ships
    // in flight, not sockets, so an account that never finishes selecting a
    // ship could hold connections open without bound — two Prisma queries and a
    // socket-map slot each. Oldest go first and the arrival is never evicted,
    // so a player's own stale tabs can never lock them out.
    // @see gateway/socket-cap.ts
    const forUser = this.socketsByUser.get(userid) ?? [];
    for (const staleId of capSocketsForUser(forUser, client.id)) {
      host.log(`socket cap: closing ${staleId} for ${userid}`);
      host.server.sockets.sockets.get(staleId)?.disconnect(true);
    }
    this.socketsByUser.set(
      userid,
      [...forUser.filter((id) => id !== client.id), client.id].slice(-MAX_SOCKETS_PER_USER),
    );

    // Step 2: Look up ALL ships for this user, ordered by shipno (deterministic).
    // Replaces the previous non-deterministic findFirst — selection is now explicit.
    // Seat cap. GEMAIN.C:2769 gates ENTRY on `numwar < gemaxplrs`, where numwar
    // counts players currently in the game — so this limits concurrent SEATS,
    // not accounts. Registration stays open; boarding does not.
    const seated = this.shipStateService
      .findAllShips()
      .filter((s) => s.status === GESTAT_USER && s.userid !== userid).length;
    if (seated >= MAXPLRS) {
      host.log(`game full (${seated}/${MAXPLRS}) — refusing ${userid}`);
      client.emit('event.log', {
        text: `The game is full (${seated}/${MAXPLRS} pilots in flight). Try again shortly.`,
        category: 'system',
      });
      client.disconnect(true);
      return;
    }

    await this.presentShipEntry(host, client, userid);
  }

  /**
   * Runs fleet re-entry when a handler reports the captain is now shipless.
   * Failures are logged rather than thrown — the command itself already
   * succeeded and its reply has been sent.
   */
  /**
   * `x` — canon's exit (GEMAIN.C:2859 mnu_fightsub).
   *
   * Unboards the hull, which flushes it, runs cleartm and sets it AVAIL, then
   * puts the client back at ship entry. That last step is the point: the
   * ship-select menu is only offered on connect, so before this a pilot with a
   * SECOND ship could only reach it by dropping the connection. Canon drops
   * you to the main menu for the same reason.
   *
   * The refusal while `cantexit > 0` lives in the handler, so this only ever
   * runs on a permitted exit.
   */
  /**
   * The mirror of what boarding does to a SOCKET, run when a captain stops
   * flying without dropping the connection.
   *
   * `boardShipAndWelcome` does three things beyond hydrating the hull: joins
   * `sector:x:y` and `user:<id>`, registers the socket in the registry, and
   * announces the arrival. `x` and `abandon` undid the SHIP half — unboard,
   * flush, status AVAIL — and none of the socket half, so a captain sitting at
   * the ship-select screen stayed in the sector room they had left. Every
   * sector-scoped `event.log`, every combat broadcast and every galaxy-wide
   * `player.joined` / `player.left` kept arriving, and the rooms are the only
   * thing that bounds what a socket may hear: a pilot who is nowhere has no
   * viewpoint to scope against, so the answer is to hear nothing at all.
   *
   * The registry entry is dropped here rather than left for the disconnect
   * handler, because `list()` only hides an unregistered hull once
   * `ShipStateService` can no longer resolve it — a courtesy of eviction
   * timing, not a guarantee. @see issue #49 for the roster ghost that came out
   * of relying on it.
   *
   * Every room but the socket's own id room goes: Socket.io puts each socket
   * in a room named after itself and that one is its addressing, not ours.
   */
  private detachFromWorld(host: LifecycleHost, client: GameSocket): void {
    // Copied first: `leave` mutates the very set being walked.
    const rooms = client.rooms === undefined ? [] : Array.from(client.rooms);
    for (const room of rooms) {
      if (room !== client.id) void client.leave(room);
    }
    const removed = this.registry.remove(client.id);
    if (removed) host.server.emit('player.left', { shipId: removed.shipId });
    client.data.activeShipNo = undefined;
    // An empty roster, because the panel is scoped to the sector you are in and
    // you are no longer in one. Without it the last roster the socket received
    // stays on screen at the ship-select menu, frozen but indistinguishable
    // from a live one.
    client.emit('player.snapshot', { players: [] });
  }

  async maybeExitGame(
    host: LifecycleHost,
    client: GameSocket,
    result: import('../game/commands/command.types').CommandResult,
  ): Promise<void> {
    if (!result.exitGame) return;
    const userid = client.data.userid as string | undefined;
    const shipno = client.data.activeShipNo as number | undefined;
    if (!userid || shipno === undefined) return;
    try {
      this.scanHandler.clearScantab(userid, shipno);
      await this.shipStateService.unboard(userid, shipno);
      // After the hull is put away, not before: `unboard` is addressed by
      // `client.data.activeShipNo`, which this clears.
      this.detachFromWorld(host, client);
      // autoBoard: false — `x` means leave, so never put them straight back in,
      // even with a single hull. @see test/gateway/exit-with-one-ship.spec.ts
      await this.presentShipEntry(host, client, userid, { noticeShipLoss: false, autoBoard: false });
    } catch (err: unknown) {
      host.error('Exit to ship entry failed:', err);
    }
  }

  async maybeReenterShipEntry(
    host: LifecycleHost,
    client: GameSocket,
    result: import('../game/commands/command.types').CommandResult,
  ): Promise<void> {
    if (!result.reenterShipEntry) return;
    const userid = client.data.userid as string | undefined;
    if (!userid) return;
    try {
      // `abandon` clears `activeShipNo` in the handler and stopped there, which
      // left the same rooms and the same registration behind as `x` did.
      this.detachFromWorld(host, client);
      await this.presentShipEntry(host, client, userid, { noticeShipLoss: false });
    } catch (err: unknown) {
      host.error('Ship re-entry after abandon failed:', err);
    }
  }

  /**
   * Puts a boarded captain into the two rooms every server-pushed notice uses.
   *
   * `sector:x:y` carries sector-scoped events — combat hits, phaser fire, radio
   * on a sector frequency, ships entering and leaving, self-destruct warnings —
   * without the client having to send a `sector:join`. `user:<userid>` carries
   * per-captain alerts: the call-for-help when a planet of theirs is attacked,
   * and cloak collapse from energy starvation.
   *
   * Every path that boards a ship must call this. The onboarding finalize path
   * hand-rolled its own welcome sequence and omitted both, which left a
   * first-session pilot deaf to all of it until they reloaded.
   */
  /**
   * Rebroadcast the roster to everyone, each recipient seeing only what they
   * are allowed to.
   *
   * `ren` and the five `tea` subcommands return a `__player_snapshot__`
   * sentinel so the client picks up a changed name. That used to resolve to a
   * bare `server.emit` of `registry.list()`, whose sectors are always real —
   * so a player could type `ren A` / `ren B` in a loop and pull a live,
   * unscoped position feed for the whole roster. The v0.8.0 scoping work
   * covered the connect path and missed this one.
   *
   * The payload differs per recipient, so it has to be a fan-out rather than a
   * broadcast: Socket.io cannot vary one emit. Sockets with no ship yet
   * (onboarding, mid-selection) are skipped — they have no viewpoint to scope
   * against, and inventing one would leak.
   * @see gateway/player-visibility.ts, docs/audits/2026-09-09-security-review.md
   */
  emitScopedSnapshotToAll(host: LifecycleHost): void {
    const roster = this.registry.list();
    for (const socket of host.server.sockets.sockets.values()) {
      const userid = socket.data?.userid as string | undefined;
      const shipno = socket.data?.activeShipNo as number | undefined;
      if (!userid || shipno === undefined) continue;
      const ship = this.shipStateService.get(userid, shipno);
      if (!ship) continue;
      socket.emit('player.snapshot', {
        players: scopePlayers(roster, { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) }),
      });
    }
  }

  /**
   * Send one socket the roster as that viewer is allowed to see it — names for
   * everyone, positions only for their own sector.
   * @see gateway/player-visibility.ts
   */
  emitScopedSnapshot(
    client: Pick<GameSocket, 'emit'>,
    viewer: { x: number; y: number },
    selfShipId?: string,
  ): void {
    const players = scopePlayers(this.registry.list(), viewer);
    client.emit('player.snapshot', selfShipId ? { players, selfShipId } : { players });
  }

  /**
   * Announce an arrival: everyone learns the NAME, only the arriving sector
   * learns the position. Two emits because Socket.io cannot vary a payload per
   * recipient, and the client must never hold a position it may not show —
   * filtering in the UI leaks straight back out through devtools.
   */
  announceJoin(client: GameSocket, player: ConnectedPlayer, sector: { x: number; y: number }): void {
    const room = `sector:${sector.x}:${sector.y}`;
    client.broadcast.to(room).emit('player.joined', player);
    client.broadcast.except(room).emit('player.joined', { ...player, sector: null });
  }

  joinPlayerRooms(client: GameSocket, userid: string, sector: { x: number; y: number }): void {
    void client.join(`user:${userid}`);
    void client.join(`sector:${sector.x}:${sector.y}`);
  }

  /**
   * Resolves the captain's usable fleet and puts them somewhere they can play:
   * onboarding when they have no ship, straight aboard when they have exactly
   * one, the selection menu when they have several.
   *
   * Called on connect and again after `abandon`, which is the second half of
   * FR-704 — without it an abandoned captain sat at a session that answered
   * "No active ship." to everything.
   *
   * @see specs/013-ship-management/spec.md FR-704
   */
  /**
   * One line telling a returning captain they lost a hull while they were away.
   *
   * PORT-ORIGINAL, and a deliberate design call rather than a canon
   * transcription: canon cannot reach this state at all, because `warhupa`
   * sets GESTAT_AVAIL on hangup (GEMAIN.C:1398-1440) and a logged-off ship is
   * therefore not in the universe to be shot. Our 24/7 world creates the
   * situation, and the port answered it by dropping the pilot at the ship-name
   * prompt with no explanation — three playtest personas lost a ship and only
   * found out by inference.
   *
   * What canon does establish is that a pilot is never left to infer a loss:
   * YOURDEAD (MBMGEMSG.MSG:2099-2111) is printed with `outprfge(ALWAYS,...)`,
   * bypassing even the message filter. This is the offline equivalent, and it
   * points at the mail that carries the detail rather than restating it.
   *
   * Fire-and-forget in spirit: any failure here is swallowed, because a
   * mailbox hiccup must never keep a captain out of the game.
   */
  private async noticeShipLossOnEntry(
    host: LifecycleHost,
    client: GameSocket,
    userid: string,
  ): Promise<void> {
    try {
      const mail = await this.prisma.mailStat.findFirst({
        where: { userid, class: MAIL_CLASS_DISTRESS, type: MESG_SHIPLOSS },
        orderBy: { stamp: 'desc' },
      });
      if (!mail) return;
      const killer = mail.name1 || 'an unknown assailant';
      client.emit('event.log', {
        category: 'combat',
        text:
          `** Your ship was destroyed by ${killer} in sector (${mail.int1}, ${mail.int2}) `
          + `while you were away — see 'rea' for the report. **`,
      });
    } catch (err: unknown) {
      host.error(`Ship-loss notice lookup failed for ${userid}:`, err);
    }
  }

  async presentShipEntry(
    host: LifecycleHost,
    client: GameSocket,
    userid: string,
    opts: { noticeShipLoss?: boolean; autoBoard?: boolean } = {},
  ): Promise<void> {
    // Abandoned hulls are not ships the captain can fly (FR-702). Boarding one
    // put the player behind the router's abandoned-ship gate with no way out.
    const ships = (
      await this.prisma.ship.findMany({
        where: { userid },
        orderBy: { shipno: 'asc' },
      })
    ).filter((s) => s.status !== SHIP_STATUS_ABANDONED);

    if (ships.length === 0) {
      // No ships — new player onboarding path.
      // Before showing onboarding, verify the User row still exists. A valid JWT
      // with no User row means the DB was reset under this account — force logout
      // so the client lands on the register screen rather than hitting a crash
      // when onboarding.finalize() tries to update a non-existent User.
      const userExists = await this.users.exists(userid);
      if (!userExists) {
        client.emit('auth:logout', { reason: 'Account not found. Please register again.' });
        client.disconnect(true);
        return;
      }
      // An EMPTY fleet is the only place this notice belongs, and it is exactly
      // the moment the round-3 persona described: killed between sessions, then
      // dropped at "name your ship" with nothing saying why.
      //
      // It is also the only gate available that cannot repeat. MailStat mirrors
      // canon's MAILSTAT struct (GEMAIN.H:531) and has no read flag, `rea` is
      // read-only by contract, and the row survives until the 7-day purge — so
      // a mailbox-only condition re-announced the same loss on every login for
      // a week. Having no flyable hull is self-clearing: name one and the
      // branch is never reached again.
      //
      // The cost is that a captain who loses ONE hull out of several is not
      // told on re-entry; they still have the mail. @see docs/DECISIONS.md
      if (opts.noticeShipLoss !== false) await this.noticeShipLossOnEntry(host, client, userid);

      // New player — go directly to ship-name prompt (no class picker)
      const onboardingState: OnboardingState = { step: 'AWAITING_NAME' };
      client.data.onboarding = onboardingState;
      client.emit('prompt:ship-name', { step: 'NAME', rule: '1-19 printable ASCII' });
      return;
    }

    // Auto-boarding a lone hull is a courtesy on CONNECT — a returning pilot
    // should not pick from a menu of one. It is wrong after `x`, which in canon
    // returns you to the main menu (GEMAIN.C:2859 mnu_fightsub) rather than
    // putting you straight back in the chair. Callers that mean "leave the
    // game" pass autoBoard: false and get the menu even for one ship, which is
    // also the only screen offering logout.
    if (ships.length === 1 && opts.autoBoard !== false) {
      await this.boardShipAndWelcome(host, client, userid, ships[0]);
      return;
    }

    // >1 ships: present the ship-selection menu; do NOT board yet.
    // Store enough data in client.data to re-emit the menu on invalid reply.
    client.data.pendingShipSelect = ships.map((s, i): PendingShipSelectEntry => ({
      index: i + 1,
      shipno: s.shipno,
      shpclass: s.shpclass,
      shipname: s.shipname,
      xcoord: s.xcoord,
      ycoord: s.ycoord,
    }));
    client.emit('prompt:ship-select', {
      step: 'SHIP_SELECT',
      ships: ships.map((s, i) => ({
        index: i + 1,
        shipno: s.shipno,
        className: this.shipClassCache.getTypeName(s.shpclass) ?? `class ${s.shpclass}`,
        shipname: s.shipname,
        sector: { x: Math.floor(s.xcoord), y: Math.floor(s.ycoord) },
      })),
    });
    // Wait for prompt:reply — handled by handleShipSelectReply via handlePromptReply.
  }

  /**
   * Shared helper: hydrate a Prisma ship row into memory (if not already warm),
   * register in the ConnectedShipsRegistry, and emit the welcome sequence.
   *
   * Used by both the single-ship connection path and the multi-ship selection reply.
   *
   * @see specs/030-multi-ship/task-7-brief.md §boardShipAndWelcome
   */
  async boardShipAndWelcome(
    host: LifecycleHost,
    client: GameSocket,
    userid: string,
    ship: Ship,
  ): Promise<void> {
    const shipId = shipKey(userid, ship.shipno);

    // Hydrate into memory if not already loaded
    if (!this.shipStateService.get(userid, ship.shipno)) {
      const { prismaShipToState } = await import('../game/ship/ship-state.mappers');
      const state = prismaShipToState(ship);
      // In the delete-model a dead hull (damage >= 100) is removed from the world,
      // so such a row should not normally reach here. If one does (race with the
      // death-delete that hasn't completed yet), do NOT resurrect it — treat it as
      // not-boardable and surface an error instead of rewriting it to full health.
      if (state.damage >= 100) {
        client.emit('error', { code: 'SHIP_DESTROYED', message: 'That ship has been destroyed.' } satisfies GatewayError);
        return;
      }
      try {
        // One helper, three callers — boot hydration, here, and first-ship
        // creation. @see game/ship/session-profile.ts for why.
        applySessionProfile(state, await this.users.getSessionProfile(userid));
      } catch {
        // Non-fatal: teamcode/scanNames/scanHome will be defaults; re-derived on next full hydration
      }
      // P-002: hydrate maxTons from ShipClass; the mapper no longer hard-codes 1000.
      try {
        const cls = await this.prisma.shipClass.findFirst({
          where: { classNumber: state.shpclass },
          select: { maxTons: true },
        });
        state.maxTons = cls?.maxTons ?? undefined;
      } catch {
        // Non-fatal: leave maxTons undefined; cargo callers default to a safe value.
      }
      this.shipStateService.board(state);
    }

    client.data.activeShipNo = ship.shipno;



    // Latest-wins: displace prior socket if any
    const priorSocketId = this.registry.upsert(shipId, client.id);
    if (priorSocketId) {
      host.server.emit('player.left', { shipId });
      host.server.sockets.sockets.get(priorSocketId)?.emit('error', {
        code: 'SESSION_REPLACED',
        message: 'Another session connected with your credentials.',
      });
      host.server.sockets.sockets.get(priorSocketId)?.disconnect(true);
    }

    // Welcome sequence
    const activeShip = this.shipStateService.get(userid, ship.shipno);
    if (!activeShip) {
      client.emit('error', { code: 'NO_SHIP', message: 'Failed to load ship.' } satisfies GatewayError);
      client.disconnect(true);
      return;
    }

    // Canon greets the COMMANDER, not the hull, and the greeting carries the
    // only pointer a pilot ever gets to the help system. Ours named the ship
    // and dropped the pointer. @see GEFUNCS.C:172 tossingegame — one WELCOM
    // for every boarding, first run and returning alike (WELBACK is dead text
    // in the .MSG; nothing prints it).
    client.emit('command:result', {
      lines: [{
        text: formatMessage(
          MessageId.WELCOM,
          activeShip.username ?? (client.data.username as string | undefined) ?? userid,
        ).trim(),
        category: 'system',
      }],
    });
    const sectorX = Math.floor(activeShip.xcoord);
    const sectorY = Math.floor(activeShip.ycoord);
    this.emitScopedSnapshot(client, { x: sectorX, y: sectorY }, shipId);
    // The F Key Map panel needs the captain's bindings at login, not just
    // after an `fset`. @see src/game/commands/fkeys.ts
    client.emit('fkeys.snapshot', { fkeys: this.shipStateService.get(userid, activeShip.shipno)?.fkeys ?? [] });

    this.joinPlayerRooms(client, userid, { x: sectorX, y: sectorY });

    const connectedPlayer: ConnectedPlayer = {
      shipId,
      name: activeShip.shipname,
      sector: { x: sectorX, y: sectorY },
      shipClass: activeShip.shpclass,
    };
    // broadcast (not server.emit) — connecting client already has themselves via snapshot
    this.announceJoin(client, connectedPlayer, { x: sectorX, y: sectorY });

    // Canon's tossingegame: ANNOUN to the galaxy, ENTWAR to the star system.
    // Must come AFTER joinPlayerRooms, or the sector room the arrival is
    // announced into does not yet contain anybody. @see GEFUNCS.C:153-175
    this.announceArrival(host, activeShip);
  }

  /**
   * Rooms to skip for a FILTER-class broadcast: every pilot who has set the
   * MSG_FILTER option.
   *
   *   if (class == FILTER && warusroff(shpno)->options[MSG_FILTER] == TRUE)
   *       { clrprf(); return; }
   *
   * @see GEMAIN.C:2562-2567 outprfge
   *
   * ALWAYS-class messages bypass this entirely (GEMAIN.C:2557-2561), which is
   * why WARHUP below does not call it.
   */
  filteredRooms(): string[] {
    return [...new Set(
      this.shipStateService.findAllShips()
        .filter((s) => s.msgFilter)
        .map((s) => `user:${s.userid}`),
    )];
  }

  /**
   * A captain entering the game: ANNOUN to the whole galaxy, ENTWAR to the
   * star system they appeared in. Both are FILTER, and both are skipped
   * outright for a fully cloaked ship.
   *
   *   if (warsptr->cloak != 10) { prfmsg(ANNOUN,...); outwar(FILTER,usrnum,0); }
   *   if (warsptr->cloak != 10) { prfmsg(ENTWAR,...); outsect(FILTER,&coord,usrnum,0); }
   *
   * The test is `!= 10`, not `> 0` — a ship still spooling its cloak is
   * announced like any other. @see GEFUNCS.C:153-175 tossingegame
   */
  announceArrival(host: LifecycleHost, ship: ShipState): void {
    if (ship.cloak === 10) return;

    const typeName = this.shipClassCache.getTypeName(ship.shpclass) ?? '';
    const skip = [`user:${ship.userid}`, ...this.filteredRooms()];

    host.server.except(skip).emit('event.log', {
      category: 'system',
      text: formatMessage(MessageId.ARRIVE_GALAXY, typeName, ship.shipname),
    });
    host.server
      .to(`sector:${Math.floor(ship.xcoord)}:${Math.floor(ship.ycoord)}`)
      .except(skip)
      .emit('event.log', {
        category: 'system',
        text: formatMessage(MessageId.ARRIVE_SECTOR, typeName, ship.shipname),
      });
  }

  /**
   * A clean logoff: the ship simply vanishes from the sector it was in.
   *
   *   prfmsg(WARHUP,username(warsptr));
   *   outsect(ALWAYS,&warsptr->coord,usrnum,0);
   *
   * @see GEMAIN.C:1425-1427 warhupa
   *
   * ALWAYS, so `set filter on` does not suppress it, and warhupa has NO cloak
   * test — a cloaked ship that logs off is announced like any other. This is
   * only the clean arm; the `cantexit > 0` arm above kills the ship instead,
   * and that path announces the kill.
   */
  announceDeparture(host: LifecycleHost, ship: ShipState): void {
    host.server
      .to(`sector:${Math.floor(ship.xcoord)}:${Math.floor(ship.ycoord)}`)
      .except([`user:${ship.userid}`])
      .emit('event.log', {
        category: 'system',
        text: formatMessage(MessageId.DEPART_SECTOR, ship.username ?? ship.userid),
      });
  }

  async onDisconnect(host: LifecycleHost, client: GameSocket): Promise<void> {
    host.log(`disconnect ${client.id}`);
    const userid = client.data.userid as string | undefined;
    // Before the cantexit branch below: that path can throw or return early,
    // and a player who cannot be un-counted is a player the stats page reports
    // as online forever.
    if (userid !== undefined) this.presence.depart(userid);

    // Drop this socket from the per-account list, and the account's entry with
    // it once the last one goes — otherwise the map keeps a key per user who
    // has ever connected. @see gateway/socket-cap.ts
    if (userid !== undefined) {
      const remaining = (this.socketsByUser.get(userid) ?? []).filter((id) => id !== client.id);
      if (remaining.length > 0) this.socketsByUser.set(userid, remaining);
      else this.socketsByUser.delete(userid);
    }

    const activeShipNo = client.data.activeShipNo as number | undefined;

    if (userid !== undefined && activeShipNo !== undefined) {
      this.scanHandler.clearScantab(userid, activeShipNo);

      const ship = this.shipStateService.get(userid, activeShipNo);
      if (ship) {
        // @see GEMAIN.C:warhupa (line 1397) — if (cantexit > 0) killem(ship)
        // Anti-rage-quit: kill the ship if it disconnected mid-combat AND the
        // disconnect was initiated by the CLIENT (not the server). Server-side
        // reasons ('server namespace disconnect', 'server shutting down') are
        // produced by NestJS hot-reload and graceful shutdown — they must never
        // trigger the kill. The reason-gate is sufficient: hot-reload calls
        // server.disconnect() which Socket.io maps to 'server namespace disconnect',
        // a server-side reason not present in CLIENT_SIDE_REASONS.
        const reason = client.data.disconnectReason as string | undefined;
        const isClientSide = ConnectionLifecycleService.CLIENT_SIDE_REASONS.has(reason ?? '');
        const killed = ship.cantexit > 0 && isClientSide;

        // Telemetry BEFORE either arm runs. Both evict the hull — the kill arm
        // through COMBAT_SHIP_DESTROYED, the clean arm through `unboard` — so a
        // row written afterwards would have no position, no speed and no
        // `cantexit` to record, for precisely the disconnects worth studying.
        // Diagnostic only; it cannot throw. @see DisconnectTelemetryService
        await this.telemetry.recordDisconnect({
          userid,
          shipno: activeShipNo,
          username: ship.username ?? null,
          reason: reason ?? null,
          cantexit: ship.cantexit,
          killed,
          xcoord: ship.xcoord,
          ycoord: ship.ycoord,
          speed: ship.speed,
        });

        if (killed) {
          // Kill path: emit COMBAT_SHIP_DESTROYED so the existing handler DELETES
          // the hull row (not a reset), broadcasts the kill, and PlayerScoreService
          // awards credit. @see GEFUNCS.C:killem gepdb(GEDELETE) — attacker attribution
          // via ship.lastfired.

          // Resolve attacker by lastfired channel (same logic as
          // CombatTickService.findActiveAttackerByChannel).
          const victimKey = shipKey(userid, activeShipNo);
          // Channel lookup, not a shipno scan: `lastfired` holds the firer's
          // unique channel (this port's `usrnum`, GEMAIN.H:340). Matching on
          // `s.shipno` instead credited the kill to the first ship in the map
          // with that per-user index — every player's first ship is shipno 1,
          // so a pilot sectors away who had never fired got named as the killer.
          const byChannel = this.shipStateService
            .findAllShips()
            .find((s) => s.channel === ship.lastfired);
          const attackerShip =
            byChannel &&
            shipKey(byChannel.userid, byChannel.shipno) !== victimKey &&
            (byChannel.status === 1 || byChannel.status === 2)
              ? byChannel
              : undefined;

          // Look up kill-score points for the victim's ship class via Prisma.
          // PlayerScoreService no-ops when scoreAwarded=0 or attackerUserid=null.
          let scoreAwarded = 0;
          try {
            const cls = await this.prisma.shipClass.findFirst({
              where: { classNumber: ship.shpclass },
              select: { points: true },
            });
            scoreAwarded = cls?.points ?? 0;
          } catch {
            // Non-fatal: score defaults to 0; kill still fires without credit.
          }

          // Kill credit and cargo, through the SAME helper the combat tick
          // uses. Canon has one killem: warhupa calls it on a mid-combat
          // hangup (GEMAIN.C:1420) exactly as checkdam does on a normal death,
          // and its cargo loop (GEFUNCS.C:1122-1136) does not ask how the
          // victim died. This path used to hardcode `loot: []`, so the one
          // death a killer had to work hardest for paid nothing.
          const loot = attackerShip
            ? resolveKillSpoils(ship, attackerShip, {
                mutate: (u, n, fn) => this.shipStateService.mutate(u, n, fn),
                maxTonsFor: (shpclass) => this.shipClassCache.getMaxTons(shpclass),
                random: this.random,
              })
            : [];

          const destroyedEvent: CombatShipDestroyedEvent = {
            victimId: victimKey,
            attackerId: attackerShip ? shipKey(attackerShip.userid, attackerShip.shipno) : null,
            victimShipKey: victimKey,
            attackerShipKey: attackerShip ? shipKey(attackerShip.userid, attackerShip.shipno) : null,
            victimUserid: userid,
            attackerUserid: attackerShip ? attackerShip.userid : null,
            // The killer's NAME, captured here while the attacker is still in
            // memory. Everything downstream that is not this gateway — the
            // ship-loss mail above all — has no way to resolve a shipKey
            // afterwards, so omitting it made every offline death read
            // "destroyed by an unknown assailant": precisely the case the mail
            // exists for, and precisely the case canon names unconditionally
            // (GEFUNCS.C:1116 sits AFTER the GESTAT_AUTO branch at :1110, so
            // an AI killer is named like any other).
            attackerName: attackerShip
              ? attackerShip.shipname
              : attackerNameFromLastFired(ship, (c) =>
                  this.shipStateService.findAllShips().some((o) => o.channel === c)),
            attackerChannel: ship.lastfired,
            weapon: null,
            // Socket.io's own reason, carried through so the log can tell a
            // closed tab from a dropped connection. The kill above cannot use
            // it — canon kills on any hangup with cantexit > 0 — but a sysop
            // deciding whether to make someone whole absolutely can.
            victimDisconnectReason: reason,
            sector: { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) },
            tickAt: new Date(),
            loot,
            scoreAwarded,
          };

          // Emit via EventEmitter2 — triggers handleCombatShipDestroyed (hull DELETE +
          // galaxy broadcast) and PlayerScoreService (kill credit transfer).
          // EventEmitter2 fires synchronously, so handleCombatShipDestroyed runs inline
          // here and calls removeFromGame before this line returns. No explicit eviction
          // needed after the emit.
          // @see GEFUNCS.C:killem gepdb(GEDELETE) — dead ships are deleted, not reset.
          this.events.emit(COMBAT_SHIP_DESTROYED, destroyedEvent);
        } else {
          // Normal path: persist dormant status + flush state + evict from map.
          //
          // Session-replacement guard: only unboard if THIS socket is still the
          // registered owner of the ship. If a newer socket displaced us
          // (latest-wins, see boardShipAndWelcome ~line 288), the ship now belongs
          // to that live socket — unboarding it here (status AVAIL + eviction) would
          // strand the new session shipless ('No active ship') until it reconnects.
          // A stale socket must only clean up its own registration (done below).
          const shipId = shipKey(userid, activeShipNo);
          if (this.registry.getSocketId(shipId) === client.id) {
            // WARHUP, before the unboard — once the ship leaves the map the
            // sector it was in can no longer be read off it. Only this clean
            // arm announces a departure; the `cantexit > 0` arm above kills
            // the ship instead, and that path announces the kill.
            // @see GEMAIN.C:1425-1427 warhupa
            this.announceDeparture(host, ship);
            await this.shipStateService.unboard(userid, activeShipNo);
          }
        }
      }
    }

    const removed = this.registry.remove(client.id);
    if (removed) {
      host.server.emit('player.left', { shipId: removed.shipId });
    }
  }
}
