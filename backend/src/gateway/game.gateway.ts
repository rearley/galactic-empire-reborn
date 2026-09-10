import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PLANET_ION_FIRED, PlanetIonFiredEvent } from '../game/planet/ion-cannon';
import {
  PHYSICS_GRAVITY,
  PhysicsGravityEvent,
  PHYSICS_DESTRUCT_CANCELLED,
  PhysicsDestructCancelledEvent,
  PHYSICS_HYPERSPACE,
  PhysicsHyperspaceEvent,
  PHYSICS_UNIVERSE_EDGE,
  PhysicsUniverseEdgeEvent,
} from '../game/physics/physics-events';
import { Inject, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ge/wire';
import { UNIVMAX, GESTAT_AUTO, GESTAT_USER, MAXPLRS } from '../game/constants';
import { ShipStateService } from '../game/ship/ship-state.service';
import { ShipClassCacheService } from '../game/physics/ship-class-cache.service';
import { CommandRouterService } from '../game/commands/command-router.service';
import { ScanHandlerService } from '../game/commands/handlers/scan.handler';
import { PresenceService } from '../public/presence.service';
import { shipLetter } from '../game/commands/helpers/find-ship';
import {
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  COMBAT_MINE_DETONATION,
  COMBAT_MINE_WARNING,
  COMBAT_TARGET_WARNING,
  CombatTargetWarningEvent,
  COMBAT_DESTRUCT_BLAST,
  CombatDestructBlastEvent,
  CombatMineWarningEvent,
  COMBAT_MISS,
  COMBAT_PHASER_FIRED,
  COMBAT_SHIP_DESTROYED,
  COMBAT_SUBSYSTEM_DAMAGED,
  CombatDecoyInterceptEvent,
  CombatHitEvent,
  CombatMineDetonationEvent,
  CombatMissEvent,
  CombatPhaserFiredEvent,
  CombatShipDestroyedEvent,
  CombatSubsystemDamagedEvent,
} from '../game/combat/combat-events';
import {
  CYBERTRON_EVENT,
  CybertronSpawnedPayload,
  CybertronTauntPayload,
  CybertronBrokeOffPayload,
} from '../game/cybertron/cybertron-events';
import {
  DroidEvents,
  DroidAnnoyEvent,
  DroidSpawnedEvent,
  DroidKilledEvent,
} from '../game/droid/droid-events';
import {
  ConnectedShipsRegistry,
  ConnectedPlayer,
} from './connected-ships.registry';
import {
  PHYSICS_SECTOR_TRANSITION,
  PhysicsSectorTransitionEvent,
} from '../game/physics/physics-events';
import { shipKey, ShipState } from '../game/ship/ship-state.types';
import { SHIP_STATUS_ABANDONED } from '../game/commands/_ship-management-constants';
import { RANDOM, Random, gernd } from '../game/combat/random.port';
import { attributePlanetKill } from '../game/combat/planet-kill';
import { shouldBroadcastTransition } from './transition-visibility';
import { scopePlayers, moverVisibilityUpdates } from './player-visibility';
import { capSocketsForUser, MAX_SOCKETS_PER_USER } from './socket-cap';
import { SHIP_OVERSPEED, ShipOverspeedEvent } from '../game/ship/overspeed-events';
import { PLANET_BEACON, PlanetBeaconEvent } from '../game/ship/beacon-events';
import { BEACON_EVENT, BeaconEvent } from './events/beacon.event';
import { WsAuthGuard } from '../auth/ws-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService, SpawnSectorMissingError } from '../game/onboarding/onboarding.service';
import {
  CloakCollapsedPayload,
  DestructTickPayload,
  DestructBoomPayload,
} from '../game/commands/ship-management-tick.service';
import {
  ATTACK_OWNER_ALERT_EVENT,
  AttackOwnerAlertPayload,
} from '../game/planet/planet-attack.service';
import { ITEM_NAMES } from '../game/constants/items';
import {
  SHIP_SYSTEM_REPAIRED, ShipSystemRepairedEvent,
  SHIP_PHASER_CHARGE, ShipPhaserChargeEvent,
  SHIP_STATUS_NOTICE, ShipStatusNoticeEvent,
} from '../game/ship/repair-events';
import { SHIP_SHIELD_CHARGE, ShipShieldChargeEvent } from '../game/ship/shield-events';
import {
  SHIP_ENGINE_SHUTDOWN,
  SHIP_MISSILE_SHAKEN,
  SHIP_SPEED_REPORT,
  SHIP_WARP_PROGRESS,
  ShipEngineShutdownEvent,
  ShipMissileShakenEvent,
  ShipSpeedReportEvent,
  ShipWarpProgressEvent,
} from '../game/physics/speed-events';
import { formatMessage, MessageId } from '../game/commands/messages';
import { showarp } from '../game/ship/showarp';
import { damstr } from '../game/combat/combat-math';
import { attackerNameFromLastFired, resolveKillSpoils } from '../game/combat/kill-resolution';
import { isAiUserid } from '../game/commands/helpers/ai-userid';
import { MESG_SHIPLOSS } from '../game/player/ship-loss-mail.service';
import { DOC_PLANET_LIMIT, MAIL_CLASS_DISTRESS, RNDDOC } from '../game/constants';
import type { CommandBroadcast } from '../game/commands/command.types';

interface CommandPayload {
  input: unknown;
}

interface PromptReplyPayload {
  value: unknown;
}

interface GatewayError {
  event?: string;
  code: string;
  message: string;
}

type OnboardingState = { step: 'AWAITING_NAME' };

/** Per-entry data stored in client.data while a multi-ship player is choosing a ship. */
interface PendingShipSelectEntry {
  index: number;
  shipno: number;
  shpclass: number;
  shipname: string;
  xcoord: number;
  ycoord: number;
}

/**
 * Handles Socket.io connections, handshake JWT auth, and command dispatch.
 * @see GECMDS.C:111-225 command table
 * @see specs/003-ship-commands/contracts/websocket-events.md
 * @see specs/011-onboarding/contracts/websocket-events.md
 */
/** `usr_x:2` -> `usr_x`. A userid may itself contain colons, so drop only the last segment. */
function useridOf(shipKey: string): string {
  const parts = shipKey.split(':');
  return parts.slice(0, -1).join(':');
}

/** `usr_x:2` -> `2`. The counterpart to {@link useridOf}. */
function shipnoOf(shipKey: string): number {
  return Number(shipKey.split(':').pop());
}


/**
 * Canon prints a different message for each weapon that hits you, and only the
 * phaser one names the attacker:
 *
 *   phaser   PHITYOU / PHITDEF  "Phaser hit from Commander %s's ship..."
 *   torpedo  THIT2   / THIT1    "We have taken a hit from a torpedo, Sir!"
 *   missile  MHIT2   / MHIT1    "...hit by a hyper-missile carrying a %s charge"
 *   mine     MINE4              "ZZzzzzzsssssssssttttt! BOOOOOOM!"
 *
 * The port routed every COMBAT_HIT through PHITYOU, so a pilot who tripped his
 * OWN mine was told "Phaser hit from Commander an unknown assailant's ship,
 * caused no damage, Sir!" — wrong weapon, and an attacker canon never claims
 * for a mine. @see GEFUNCS.C:1560, :1644, GECMDS.C:987-996
 */
function hitText(
  event: CombatHitEvent,
  deflected: boolean,
  attackerLabel: string,
  attackerLetter: string,
): string {
  const hull = damstr(event.damageHull ?? 0);
  switch (event.weapon) {
    case 'hyper-phaser':
      // HPHITU — the victim is told WHICH weapon, because only the
      // hyper-phaser can reach them at warp. @see GECMDS.C:1076
      return formatMessage(MessageId.HP_HIT_YOU, attackerLabel, hull);
    case 'torpedo':
      return formatMessage(deflected ? MessageId.THIT1 : MessageId.THIT2);
    case 'missile':
      return formatMessage(deflected ? MessageId.MHIT1 : MessageId.MHIT2, hull);
    case 'mine':
      // MINE4 wants bearing and distance; the blast is at the victim, so the
      // reading is zero on both — canon's own laymine blast reports from where
      // the mine was, and we do not carry that on the hit event yet.
      return formatMessage(MessageId.MINE4, 0, 0, hull);
    default:
      // PHITDEF leads with the attacker's scan LETTER — canon passes
      // shpltr(othusn,usrn), the letter in the VICTIM's table, so it is the
      // one the victim would type to shoot back. The port's copy of this
      // string had dropped the %c entirely, which is precisely the drift
      // hand-transcribing canon produces.
      return deflected
        ? formatMessage(
            MessageId.PHITDEF,
            attackerLetter,
            attackerLabel,
            Math.round(event.damageShield ?? 0),
          )
        : formatMessage(MessageId.PHITYOU, attackerLabel, hull);
  }
}

/**
 * The Socket.io server and per-connection socket, typed with the wire
 * contract from `@ge/wire` so a wrong event name or payload shape is a
 * build error rather than a runtime surprise.
 *
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */
type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Every shape `processBroadcasts`/`emitToSockets` actually call `.emit()` on:
 * the whole server (galaxy-wide), a room operator (`server.to(room)`), or one
 * connected socket. All three carry the same `ServerToClientEvents` map.
 */
type BroadcastTarget = GameServer | GameSocket | ReturnType<GameServer['to']>;

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: GameServer;

  private readonly logger = new Logger(GameGateway.name);

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
    private readonly commandRouter: CommandRouterService,
    private readonly registry: ConnectedShipsRegistry,
    private readonly wsAuthGuard: WsAuthGuard,
    private readonly prisma: PrismaService,
    private readonly onboardingService: OnboardingService,
    private readonly scanHandler: ScanHandlerService,
    private readonly shipClassCache: ShipClassCacheService,
    @Inject(RANDOM) private readonly random: Random,
    private readonly events: EventEmitter2,
    private readonly presence: PresenceService,
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
  async handleConnection(client: GameSocket): Promise<void> {
    this.logger.log(`connection ${client.id}`);

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
      this.logger.log(`socket cap: closing ${staleId} for ${userid}`);
      this.server.sockets.sockets.get(staleId)?.disconnect(true);
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
      this.logger.log(`game full (${seated}/${MAXPLRS}) — refusing ${userid}`);
      client.emit('event.log', {
        text: `The game is full (${seated}/${MAXPLRS} pilots in flight). Try again shortly.`,
        category: 'system',
      });
      client.disconnect(true);
      return;
    }

    await this.presentShipEntry(client, userid);
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
  private async maybeExitGame(
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
      // autoBoard: false — `x` means leave, so never put them straight back in,
      // even with a single hull. @see test/gateway/exit-with-one-ship.spec.ts
      await this.presentShipEntry(client, userid, { noticeShipLoss: false, autoBoard: false });
    } catch (err: unknown) {
      this.logger.error('Exit to ship entry failed:', err);
    }
  }

  private async maybeReenterShipEntry(
    client: GameSocket,
    result: import('../game/commands/command.types').CommandResult,
  ): Promise<void> {
    if (!result.reenterShipEntry) return;
    const userid = client.data.userid as string | undefined;
    if (!userid) return;
    try {
      await this.presentShipEntry(client, userid, { noticeShipLoss: false });
    } catch (err: unknown) {
      this.logger.error('Ship re-entry after abandon failed:', err);
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
  private emitScopedSnapshotToAll(): void {
    const roster = this.registry.list();
    for (const socket of this.server.sockets.sockets.values()) {
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
  private emitScopedSnapshot(
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
  private announceJoin(client: GameSocket, player: ConnectedPlayer, sector: { x: number; y: number }): void {
    const room = `sector:${sector.x}:${sector.y}`;
    client.broadcast.to(room).emit('player.joined', player);
    client.broadcast.except(room).emit('player.joined', { ...player, sector: null });
  }

  private joinPlayerRooms(client: GameSocket, userid: string, sector: { x: number; y: number }): void {
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
  private async noticeShipLossOnEntry(client: GameSocket, userid: string): Promise<void> {
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
      this.logger.error(`Ship-loss notice lookup failed for ${userid}:`, err);
    }
  }

  private async presentShipEntry(
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
      const userExists = await this.prisma.user.findUnique({ where: { userid }, select: { userid: true } });
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
      if (opts.noticeShipLoss !== false) await this.noticeShipLossOnEntry(client, userid);

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
      await this.boardShipAndWelcome(client, userid, ships[0]);
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
  private async boardShipAndWelcome(
    client: GameSocket,
    userid: string,
    ship: { shipno: number; shipname: string; shpclass: number; xcoord: number; ycoord: number; damage: number; energy: number; heading: number; speed: number; where: number; [key: string]: unknown },
  ): Promise<void> {
    const shipId = shipKey(userid, ship.shipno);

    // Hydrate into memory if not already loaded
    if (!this.shipStateService.get(userid, ship.shipno)) {
      const { prismaShipToState } = await import('../game/ship/ship-state.mappers');
      const state = prismaShipToState(ship as never);
      // In the delete-model a dead hull (damage >= 100) is removed from the world,
      // so such a row should not normally reach here. If one does (race with the
      // death-delete that hasn't completed yet), do NOT resurrect it — treat it as
      // not-boardable and surface an error instead of rewriting it to full health.
      if (state.damage >= 100) {
        client.emit('error', { code: 'SHIP_DESTROYED', message: 'That ship has been destroyed.' } satisfies GatewayError);
        return;
      }
      try {
        const userRow = await this.prisma.user.findUnique({ where: { userid }, select: { teamcode: true, options: true, kills: true, username: true, fkeys: true } });
        if (userRow?.teamcode != null) state.teamcode = userRow.teamcode;
        if (userRow?.username) state.username = userRow.username;
        if (userRow?.fkeys) state.fkeys = userRow.fkeys;
        // Cumulative captain kills, so a veteran boarding a fresh hull keeps
        // the Cybertron standing they earned. @see GECYBS.C:441, :524
        if (userRow?.kills != null) state.userKills = userRow.kills;
        state.scanNames = (userRow?.options?.[0] ?? 0) === 1;
        state.scanHome = (userRow?.options?.[1] ?? 0) === 1;
        state.scanFull = (userRow?.options?.[2] ?? 0) === 1;
        state.msgFilter = (userRow?.options?.[3] ?? 0) === 1;
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
      this.server.emit('player.left', { shipId });
      this.server.sockets.sockets.get(priorSocketId)?.emit('error', {
        code: 'SESSION_REPLACED',
        message: 'Another session connected with your credentials.',
      });
      this.server.sockets.sockets.get(priorSocketId)?.disconnect(true);
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
    this.announceArrival(activeShip);
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
  private filteredRooms(): string[] {
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
  private announceArrival(ship: ShipState): void {
    if (ship.cloak === 10) return;

    const typeName = this.shipClassCache.getTypeName(ship.shpclass) ?? '';
    const skip = [`user:${ship.userid}`, ...this.filteredRooms()];

    this.server.except(skip).emit('event.log', {
      category: 'system',
      text: formatMessage(MessageId.ARRIVE_GALAXY, typeName, ship.shipname),
    });
    this.server
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
  private announceDeparture(ship: ShipState): void {
    this.server
      .to(`sector:${Math.floor(ship.xcoord)}:${Math.floor(ship.ycoord)}`)
      .except([`user:${ship.userid}`])
      .emit('event.log', {
        category: 'system',
        text: formatMessage(MessageId.DEPART_SECTOR, ship.username ?? ship.userid),
      });
  }

  async handleDisconnect(client: GameSocket): Promise<void> {
    this.logger.log(`disconnect ${client.id}`);
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
        const isClientSide = GameGateway.CLIENT_SIDE_REASONS.has(reason ?? '');

        if (ship.cantexit > 0 && isClientSide) {
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
            this.announceDeparture(ship);
            await this.shipStateService.unboard(userid, activeShipNo);
          }
        }
      }
    }

    const removed = this.registry.remove(client.id);
    if (removed) {
      this.server.emit('player.left', { shipId: removed.shipId });
    }
  }

  /**
   * Handles player text commands routed through CommandRouterService.
   * @see GECMDS.C dispatch loop
   */
  @SubscribeMessage('command')
  handleCommand(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: CommandPayload,
  ): void {
    // One command at a time, per socket.
    //
    // This used to run `runCommand` straight away. A handler that awaits the
    // database releases control, so the next command from the same socket
    // started immediately and two were half-done at once, both working from
    // state read before either had written. Part B made the money and cargo
    // invariants hold whatever the timing, so this is no longer what stands
    // between a player and free credits; what it buys now is that commands
    // COMPLETE IN THE ORDER TYPED — which canon got for free by running one
    // command per player — that the ship is looked up after the previous
    // command finished rather than before it, and that the next async handler
    // anyone writes is safe by default instead of only if they remembered.
    //
    // The chain lives on `client.data`, so it is collected with the socket and
    // there is nothing to clean up on disconnect. `.catch` before storing it:
    // a rejected link must move the queue on, or one failed command would
    // silence that player for the rest of their session.
    //
    // NOT covered, deliberately: the 1s and 6s ticks, which mutate ship state
    // on timers and were never in this queue. Only invariants at the data layer
    // hold against those. @see docs/DECISIONS.md 2026-09-09
    const prior = (client.data.commandChain as Promise<void> | undefined) ?? Promise.resolve();
    const next = prior.then(() => this.runCommand(client, body));
    client.data.commandChain = next.catch(() => undefined);
  }

  /** One command, start to finish. Queued by {@link handleCommand}. */
  private async runCommand(client: GameSocket, body: CommandPayload): Promise<void> {
    const userid = client.data.userid as string | undefined;
    const activeShipNo = client.data.activeShipNo as number | undefined;

    if (!userid || activeShipNo === undefined) {
      client.emit('command:result', {
        lines: [{ text: 'No active ship.', category: 'system' }],
      });
      return;
    }

    const ship = this.shipStateService.get(userid, activeShipNo);
    if (!ship) {
      client.emit('command:result', {
        lines: [{ text: 'No active ship.', category: 'system' }],
      });
      return;
    }

    const rawInput = typeof body.input === 'string' ? body.input : '';

    // A handler that asked an open question (e.g. `land` on an unowned planet,
    // "What would you like to name this planet?") set `expectFollowup`. Route
    // this input straight back to that verb rather than through the command
    // router — otherwise a planet named "New Terra" matches the `new` verb.
    const pendingFollowup = client.data.pendingFollowup as string | undefined;
    let input = rawInput;
    if (pendingFollowup !== undefined) {
      client.data.pendingFollowup = undefined;
      const answer = rawInput.trim();
      if (answer === '') {
        client.emit('command:result', {
          lines: [{ text: 'Never mind.', category: 'system' }],
        });
        return;
      }
      input = `${pendingFollowup} ${answer}`;
    }

    try {
      // AWAITED, not fire-and-forget. The caller chains the next command onto
      // this promise, so returning early would leave the queue ordering only
      // the synchronous half of each command and serialize nothing.
      const result = await this.commandRouter.dispatch(input, ship, { client });
      this.emitCommandResult(client, result);
      this.processBroadcasts(result, client);
      await this.maybeReenterShipEntry(client, result);
      await this.maybeExitGame(client, result);
    } catch (err: unknown) {
      this.logger.error('Command handler threw:', err);
      client.emit('command:result', {
        lines: [{ text: 'Internal error processing command.', category: 'system' }],
      });
    }
  }

  /**
   * Handles prompt replies for both ship-selection (multi-ship players) and
   * onboarding (new players entering a ship name).
   *
   * Ship-select branch fires when `client.data.pendingShipSelect` is set (>1 ships
   * were found on connect). Valid 1-based index → `boardShipAndWelcome`; invalid
   * → re-emit `prompt:ship-select` with the stored fleet list.
   *
   * @see specs/030-multi-ship/task-7-brief.md T7 §handlePromptReply
   * @see specs/011-onboarding/contracts/websocket-events.md §prompt:reply
   */
  @SubscribeMessage('prompt:reply')
  async handlePromptReply(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: PromptReplyPayload,
  ): Promise<void> {
    const userid = client.data.userid as string | undefined;

    // ── Multi-ship selection branch ──────────────────────────────────────────
    const pendingShipSelect = client.data.pendingShipSelect as PendingShipSelectEntry[] | undefined;
    if (pendingShipSelect && userid) {
      await this.handleShipSelectReply(client, userid, pendingShipSelect, body.value);
      return;
    }

    // ── Onboarding branch ────────────────────────────────────────────────────
    const onboarding = client.data.onboarding as OnboardingState | undefined;

    if (!onboarding || !userid) {
      client.emit('error', { code: 'NOT_IN_ONBOARDING', message: 'Not in onboarding.' } satisfies GatewayError);
      return;
    }

    if (onboarding.step === 'AWAITING_NAME') {
      const name = typeof body.value === 'string' ? body.value.trim() : '';
      if (!this.onboardingService.validateNameReply(name)) {
        client.emit('prompt:ship-name', {
          step: 'NAME',
          rule: '1-19 printable ASCII',
          error: 'invalid-format',
        });
        return;
      }

      try {
        const state = await this.onboardingService.finalize(userid, name);
        const shipId = shipKey(userid, state.shipno);

        const priorSocketId = this.registry.upsert(shipId, client.id);
        if (priorSocketId) {
          this.server.emit('player.left', { shipId });
          this.server.sockets.sockets.get(priorSocketId)?.disconnect(true);
        }

        client.data.activeShipNo = state.shipno;
        client.data.onboarding = undefined;

        // This path duplicates the welcome sequence instead of going through
        // boardShipAndWelcome, and the copy used to omit both joins — so a
        // first-session pilot received no sector-scoped broadcast at all (radio,
        // ships entering or leaving, someone's self-destruct countdown) and none
        // of the per-captain alerts (planet under attack, cloak collapse) until
        // they reloaded the page.
        this.joinPlayerRooms(client, userid, {
          x: Math.floor(state.xcoord),
          y: Math.floor(state.ycoord),
        });

        // First run: one welcome line and nothing else left a new pilot with no
        // idea that `hel` exists, in a game that is entirely typed commands.
        client.emit('command:result', {
          lines: [
            {
              text: formatMessage(
                MessageId.WELCOM,
                // The freshly-finalized ShipState carries no username yet, so the
                // JWT's handle is the only place the commander's name lives on
                // this path. Without it a brand-new pilot is greeted by their
                // internal user id.
                state.username ?? (client.data.username as string | undefined) ?? userid,
              ).trim(),
              category: 'system',
            },
            {
              text: 'You are in the neutral zone at sector (0,0) — no one may fire here.',
              category: 'info',
            },
            {
              text: "Type 'hel' for the command topics, 'rep nav' for your position, 'sca lo' to look around.",
              category: 'info',
            },
          ],
        });
        const sector = { x: Math.floor(state.xcoord), y: Math.floor(state.ycoord) };
        this.emitScopedSnapshot(client, sector, shipId);
    // The F Key Map panel needs the captain's bindings at login, not just
    // after an `fset`. @see src/game/commands/fkeys.ts
        client.emit('fkeys.snapshot', { fkeys: state.fkeys ?? [] });

        const connectedPlayer: ConnectedPlayer = {
          shipId,
          name: state.shipname,
          sector,
          shipClass: state.shpclass,
        };
        // broadcast — connecting client already has themselves via snapshot
        this.announceJoin(client, connectedPlayer, sector);

      } catch (err: unknown) {
        if (err instanceof SpawnSectorMissingError) {
          client.emit('error', { code: 'SPAWN_MISSING', message: err.message } satisfies GatewayError);
          return;
        }
        // Distinguish Prisma unique constraint violations by constraint name
        if (
          typeof err === 'object' && err !== null &&
          'code' in err && (err as { code: string }).code === 'P2002'
        ) {
          const meta = (err as { meta?: { target?: string | string[] } }).meta;
          const target = Array.isArray(meta?.target) ? meta.target.join(',') : String(meta?.target ?? '');
          if (target.includes('userid') || target.includes('Ship_userid_key')) {
            // Race: this user won another concurrent finalize → treat as returning player
            const ship = await this.prisma.ship.findFirst({ where: { userid } });
            if (ship) {
              const shipId = shipKey(userid, ship.shipno);
              this.registry.upsert(shipId, client.id);
              client.data.activeShipNo = ship.shipno;
              client.data.onboarding = undefined;
              this.joinPlayerRooms(client, userid, {
                x: Math.floor(ship.xcoord),
                y: Math.floor(ship.ycoord),
              });
              client.emit('command:result', {
                lines: [{
                  text: formatMessage(
                    MessageId.WELCOM,
                    (client.data.username as string | undefined) ?? userid,
                  ).trim(),
                  category: 'system',
                }],
              });
            }
            return;
          }
          // Name collision
          client.emit('prompt:ship-name', {
            step: 'NAME',
            rule: '1-19 printable ASCII',
            error: 'name-taken',
          });
          return;
        }
        this.logger.error('Onboarding finalize error:', err);
        client.emit('error', { code: 'INTERNAL', message: 'Failed to create ship.' } satisfies GatewayError);
      }
    }
  }

  /**
   * Processes a `prompt:reply` value when `pendingShipSelect` is set.
   * Parses `value` as a 1-based index into the pending fleet list:
   *   - Valid index + ship found in DB → boards it via `boardShipAndWelcome`, clears pending.
   *   - Invalid index OR ship no longer in DB → re-emits `prompt:ship-select` with the
   *     stored fleet list (no extra DB round-trip for the menu).
   *
   * @see specs/030-multi-ship/task-7-brief.md T7
   */
  private async handleShipSelectReply(
    client: GameSocket,
    userid: string,
    pending: PendingShipSelectEntry[],
    rawValue: unknown,
  ): Promise<void> {
    // The browser client sends the index as a NUMBER (`emitPromptReply` is typed
    // `number | string`); string-only parsing coerced it to '' and re-emitted the
    // menu forever, so a captain with two ships could never board either.
    const indexNum =
      typeof rawValue === 'number'
        ? rawValue
        : parseInt(typeof rawValue === 'string' ? rawValue.trim() : '', 10);
    const isValidIndex =
      Number.isInteger(indexNum) && indexNum >= 1 && indexNum <= pending.length;

    if (isValidIndex) {
      const chosen = pending[indexNum - 1];
      // Reload from DB to ensure the hull row still exists (could have been destroyed mid-select).
      const shipRow = await this.prisma.ship.findFirst({ where: { userid, shipno: chosen.shipno } });
      if (shipRow) {
        await this.boardShipAndWelcome(client, userid, shipRow);
        client.data.pendingShipSelect = undefined;
        return;
      }
      // Ship no longer exists — fall through to re-emit menu
    }

    // Invalid index or ship gone — re-emit the selection menu with the stored fleet list.
    client.emit('prompt:ship-select', {
      step: 'SHIP_SELECT',
      ships: pending.map(e => ({
        index: e.index,
        shipno: e.shipno,
        className: this.shipClassCache.getTypeName(e.shpclass) ?? `class ${e.shpclass}`,
        shipname: e.shipname,
        sector: { x: Math.floor(e.xcoord), y: Math.floor(e.ycoord) },
      })),
    });
  }

  /*
   * `sector:join` / `sector:leave` were removed on 2026-09-09.
   *
   * They took x and y from the CLIENT and joined that room, gated only on "are
   * you a bound player" — never "is this your sector". `validateCoord` checks
   * integer type and +/-UNIVMAX and nothing else, so all 201x201 rooms were
   * reachable, nothing but a disconnect ever removed a join, and there was no
   * room cap. A player could subscribe to the whole galaxy and read every
   * `player.sector` update, which carries explicit coordinates — a live
   * position tracker, and an unbounded per-socket allocation besides.
   *
   * Nothing called them: the frontend never emitted either event, and ships are
   * placed in their sector room server-side by `joinPlayerRooms` and moved by
   * `handleSectorTransition`. Dead surface with a hole in it.
   * @see docs/audits/2026-09-09-security-review.md M4
   */

  /**
   * The ship name behind a `userid:shipno` key, or undefined if it has left.
   *
   * Guarded: this only decorates a combat notice, and a thrown lookup inside
   * an @OnEvent handler would drop the broadcast for everyone in the sector.
   * A missing name costs a nicer label; a thrown one costs the whole event.
   */
  /**
   * One greppable line describing everything a destroyed hull was carrying.
   *
   * Must be called BEFORE the hull leaves the in-memory map, and must never
   * throw: it runs inside the destruction handler, and losing the kill because
   * the forensics failed would be far worse than losing the forensics.
   */
  private shipLossManifest(event: CombatShipDestroyedEvent): string {
    const parts: string[] = [
      'ship destroyed:',
      `victim=${event.victimShipKey}`,
      `attacker=${event.attackerShipKey ?? 'none'}`,
      `cause=${event.weapon ?? 'unknown'}`,
      `sector=(${event.sector.x},${event.sector.y})`,
    ];

    // Only present when the death came from the disconnect path. It is the one
    // fact that separates "closed the tab" from "their network dropped", and
    // the kill treats both identically.
    if (event.victimDisconnectReason) {
      parts.push(`disconnectReason='${event.victimDisconnectReason}'`);
    }

    try {
      const keyParts = event.victimShipKey.split(':');
      const shipno = Number(keyParts[keyParts.length - 1]);
      const ship = Number.isFinite(shipno)
        ? this.shipStateService.get(keyParts.slice(0, -1).join(':'), shipno)
        : undefined;

      if (ship) {
        let className: string | undefined;
        try {
          className = this.shipClassCache.getTypeName(ship.shpclass);
        } catch {
          /* cache miss — the class NUMBER is the part that matters for restoring */
        }
        parts.push(
          `name='${ship.shipname}'`,
          `class=${ship.shpclass}${className ? `(${className})` : ''}`,
          // The fittings are the expensive half of a loss: a Mark-6 phaser is
          // ~253,000 credits of trade-ins, and nothing else records them.
          `phaser=${ship.phasrtype}`,
          `shield=${ship.shieldtype}`,
        );

        const cargo = (ship.items ?? [])
          .map((qty, i) => ({ name: ITEM_NAMES[i] ?? `item${i}`, qty }))
          .filter((e) => (e.qty ?? 0n) > 0n)
          .map((e) => `${e.name}=${e.qty}`);
        parts.push(`cargo=[${cargo.join(' ')}]`);
      } else {
        // A race, or an AI victim with no ShipState. Keep the identity line
        // rather than dropping the record entirely.
        parts.push('manifest=unavailable(hull-not-in-memory)');
      }
    } catch (err: unknown) {
      parts.push(`manifest=unavailable(${err instanceof Error ? err.message : String(err)})`);
    }

    return parts.join(' ');
  }

  private shipNameOf(shipKey: string): string | undefined {
    try {
      const parts = shipKey.split(':');
      const shipno = Number(parts[parts.length - 1]);
      if (!Number.isFinite(shipno)) return undefined;
      return this.shipStateService.get(parts.slice(0, -1).join(':'), shipno)?.shipname;
    } catch {
      return undefined;
    }
  }

  /** @see specs/006b-combat/contracts/combat-events.md */
  /**
   * A phaser discharge is heard by the SHOOTER, not the sector.
   *
   * Canon prints PFIRED with `outprfge(FILTER, usrn)` — `usrn` is the firer's
   * own channel (GECMDS.C:943-944). Only the HIT is public. Broadcasting the
   * shot to the whole sector produced a log full of "Cybrg-203 fires phasers!"
   * with no outcome attached, because most AI shots miss or fall under the
   * `damage >= 1` gate and correctly emit nothing further. A player watching
   * that cannot tell a near miss from a bug.
   *
   * The name is resolved here for the same reason the hit handler does it:
   * AI are absent from the client's roster, so an unenriched event renders as
   * the userid ("Cybrg-203") rather than the ship ("Cybertron 40123") — and
   * canon names an AI by its hull. @see GEFUNCS.C:2596 username
   */
  @OnEvent(COMBAT_PHASER_FIRED)
  handleCombatPhaserFired(event: CombatPhaserFiredEvent): void {
    const enriched: CombatPhaserFiredEvent = {
      ...event,
      shipName: this.shipNameOf(event.shipId),
    };
    this.server.to(`user:${useridOf(event.shipId)}`).emit(COMBAT_PHASER_FIRED, enriched);
  }

  @OnEvent(COMBAT_HIT)
  handleCombatHit(event: CombatHitEvent): void {
    // Name the attacking SHIP, not its userid — `sca sh` takes the ship name,
    // and AI ships are absent from the roster the client resolves names from.
    const enriched: CombatHitEvent = {
      ...event,
      attackerName: this.shipNameOf(event.attackerId),
      victimName: this.shipNameOf(event.victimId),
    };
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(COMBAT_HIT, enriched);

    // The VICTIM also gets canon's text. C prints PHITYOU when the hull takes
    // it and PHITDEF when the shields turn it (GECMDS.C:987-996), each with
    // its own outprfge to the victim's channel. The structured COMBAT_HIT is
    // our own channel and stays — but a client that renders only text saw
    // nothing at all, and the two outcomes read identically even to one that
    // did. damstr renders hull damage as a WORD; a deflection reports a number.
    const deflected = (event.damageHull ?? 0) <= 0 && (event.damageShield ?? 0) > 0;
    const attackerLabel = enriched.attackerName ?? 'an unknown assailant';
    const [victimUser, victimShip] = [useridOf(event.victimId), shipnoOf(event.victimId)];
    const attackerLetter = shipLetter(
      this.scanHandler.lettersFor(victimUser, victimShip),
      event.attackerId,
    );
    this.server.to(`user:${useridOf(event.victimId)}`).emit('event.log', {
      category: 'combat',
      text: hitText(event, deflected, attackerLabel, attackerLetter),
    });

    // The FIRER is told too, and canon says it in its own words rather than
    // leaving the shooter to infer it from the victim's line:
    //
    //   if (channel != 255)
    //     {
    //     prfmsg(MTACC1+mt,shpltr(channel,usrn),ptr->shipname);
    //     outprfge(ALWAYS,channel);
    //     ptr->lastfired = channel;
    //     }
    //
    // `checktm` calls `acctm` on both weapons and both shield branches
    // (GEFUNCS.C:1562 and :1575 torpedo, :1646 and :1660 missile).
    // `shpltr(usrn,ship)`
    // reads the FIRST argument's scan table, so the letter is the shooter's own
    // for the target. Both strings were extracted into CANON_MESSAGES and
    // neither was ever sent: a phaser told you what it did, a torpedo volley
    // told you nothing, and you learned the result from the target's next scan.
    // @see GEFUNCS.C:1742 `ptr->lastfired = channel;`
    if (event.weapon === 'torpedo' || event.weapon === 'missile') {
      const attackerUser = useridOf(event.attackerId);
      // `?:<channel>` is this port's marker for a firer no ship holds any more,
      // which is canon's `channel == 255` — confirmed to nobody.
      if (attackerUser !== '?') {
        const victimLetter = shipLetter(
          this.scanHandler.lettersFor(attackerUser, shipnoOf(event.attackerId)),
          event.victimId,
        );
        this.server.to(`user:${attackerUser}`).emit('event.log', {
          category: 'combat',
          text: formatMessage(
            event.weapon === 'torpedo' ? MessageId.MTACC1 : MessageId.MTACC2,
            victimLetter,
            enriched.victimName ?? '?',
          ),
        });
      }
    }

    // Victim may be in a DIFFERENT sector room (cross-sector phaser range), so
    // deliver directly — but only if the sector broadcast did not already
    // reach them. C prints PHITYOU exactly once per hit
    // (GECMDS.C:989-990), and the unconditional direct emit meant a victim
    // standing in the attacker's own sector saw every hit on them twice. The
    // damage was applied once; only the notification doubled, which reads as
    // taking twice the fire you actually took.
    const victimSocketId = this.registry.getSocketId(event.victimId);
    if (victimSocketId) {
      const victimSocket = this.server.sockets.sockets.get(victimSocketId);
      if (victimSocket && !victimSocket.rooms.has(room)) {
        victimSocket.emit(COMBAT_HIT, enriched);
      }
    }
  }

  @OnEvent(COMBAT_MISS)
  handleCombatMiss(event: CombatMissEvent): void {
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(COMBAT_MISS, event);
  }

  @OnEvent(COMBAT_DECOY_INTERCEPT)
  handleCombatDecoyIntercept(event: CombatDecoyInterceptEvent): void {
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(COMBAT_DECOY_INTERCEPT, event);
  }

  @OnEvent(COMBAT_MINE_DETONATION)
  handleCombatMineDetonation(event: CombatMineDetonationEvent): void {
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(COMBAT_MINE_DETONATION, event);
  }

  /**
   * Routes subsystem-damage notice to the victim's own socket.
   * C source does prfmsg(RND*)+outprfge to the victim on every subsystem hit.
   * @see GEFUNCS.C randamage subsystem damage handlers (C-010, Fix 3)
   */
  @OnEvent(COMBAT_SUBSYSTEM_DAMAGED)
  handleCombatSubsystemDamaged(event: CombatSubsystemDamagedEvent): void {
    const subsystemMessages: Record<string, string> = {
      shields:   'Shields damaged!',
      phasr:     'Phasers damaged!',
      firecntl:  'Fire control damaged!',
      cloak:     'Cloak damaged!',
      tactical:  'Tactical computer damaged!',
      helm:      'Helm damaged!',
    };
    const text = subsystemMessages[event.subsystem] ?? `${event.subsystem} damaged!`;
    const victimSocketId = this.registry.getSocketId(event.victimId);
    if (victimSocketId) {
      const victimSocket = this.server.sockets.sockets.get(victimSocketId);
      victimSocket?.emit('event.log', { category: 'combat', text });
    }
  }

  /**
   * Ship destruction is broadcast galaxy-wide.
   * Also clears the victim's scantab so stale assignments don't persist on respawn.
   * @see specs/006b-combat/contracts/combat-events.md
   */
  /**
   * shipId → the planet whose ion cannons last hit it, and when.
   *
   * This is the evidence that a planet made a kill. The victim's `lastfired`
   * cannot serve: `fireion` sets it to -1, but so does NO_CHANNEL when a
   * firer leaves the game, so inferring from it would blame a colony for any
   * death whose attacker had disconnected.
   *
   * Written on every ion hit, read and cleared when that ship dies, and only
   * honoured inside ION_ATTRIBUTION_WINDOW_MS so a ship that was shot at,
   * escaped and died elsewhere cannot inherit the name. Bounded by the number
   * of ships currently besieging planets.
   */
  private readonly lastIonAttacker = new Map<string, { name: string; at: number }>();

  /**
   * Overspeed strain and engine failure — routed to the one captain it
   * happened to, as C does (`outprfge(FILTER,usrn)` / `ALWAYS`). These used to
   * be dropped entirely behind a stale TODO, so a pilot's first sign of
   * trouble was a dead warp drive. @see ship/overspeed-events.ts
   */
  /**
   * A colony's beacon, to the one captain who rolled it.
   *
   * Routed to `user:` and not the sector room on purpose: canon rolls per ship
   * inside the per-user movement path (GEFUNCS.C:809-813), so two pilots in the
   * same sector hear it on different ticks. A room broadcast would have the
   * colony shout at everyone in unison — a different, worse thing.
   */
  @OnEvent(PLANET_BEACON)
  handlePlanetBeacon(event: PlanetBeaconEvent): void {
    this.server.to(`user:${useridOf(event.shipId)}`).emit('event.log', {
      category: 'info',
      text: `*** Beacon Message from Planet # ${event.plnum} ${event.message}`,
    });
  }

  @OnEvent(SHIP_OVERSPEED)
  handleShipOverspeed(event: ShipOverspeedEvent): void {
    this.server.to(`user:${useridOf(event.shipId)}`).emit('event.log', {
      category: 'combat',
      text: event.kind === 'break' ? `** ${event.text} **` : event.text,
    });
  }

  /**
   * A player's display handle, or null. Canon's `username()` names a player by
   * their handle and an AI by its hull; ours caches the handle on ShipState.
   * @see GEFUNCS.C:2596, src/game/ship/display-name.ts
   */
  private handleOf(shipKeyStr: string | null): string | null {
    if (!shipKeyStr) return null;
    const idx = shipKeyStr.lastIndexOf(':');
    if (idx < 0) return null;
    const ship = this.shipStateService.get(shipKeyStr.slice(0, idx), Number(shipKeyStr.slice(idx + 1)));
    return ship?.username ?? null;
  }

  /**
   * One kill in six yields the victim's colony list to the victor.
   *
   *   if (gernd()%RNDDOC == 0) {
   *       if (qeqbtv(ptr->userid,1)) {
   *           prfmsg(CAPTDOC);
   *           do { ...if (sameas(planet.userid,ptr->userid))
   *                    prf("%-20s %d %d   %d \r",name,xsect,ysect,plnum);
   *                  outprfge(ALWAYS,who); ... } while (qnxbtv() && (++i < 20));
   *       }
   *   }
   *
   * @see GEFUNCS.C:1227-1251 (inside killem), GEMAIN.H:192-193 SHOWDOC/RNDDOC
   *
   * `ptr` is the VICTIM, so what is captured is a list of THEIR planets, handed
   * to `who` — the killer. It is real intelligence: where to raid next. SHOWDOC
   * is `#define SHOWDOC 1`, so this is compiled in, not an optional extra.
   *
   * The 20 is canon's cap on the listing, and the roll is taken BEFORE the
   * lookup so an unlucky kill costs no query.
   */
  private async revealCapturedDocument(victimUserid: string, killerUserid: string): Promise<void> {
    if (!killerUserid) return;
    if (gernd(this.random) % RNDDOC !== 0) return;

    const planets = await this.prisma.planet.findMany({
      where: { userid: victimUserid },
      select: { name: true, xsect: true, ysect: true, plnum: true },
      take: DOC_PLANET_LIMIT,
    });
    if (planets.length === 0) return;

    const room = `user:${killerUserid}`;
    this.server.to(room).emit('event.log', {
      category: 'combat',
      text: formatMessage(MessageId.CAPTURED_DOC),
    });
    for (const p of planets) {
      this.server.to(room).emit('event.log', {
        category: 'combat',
        text: `${p.name.padEnd(20)} ${p.xsect} ${p.ysect}   ${p.plnum}`,
      });
    }
  }

  /**
   * Returns the hull write so the shutdown drain can WAIT for it.
   *
   * On a live tick nothing awaits this — EventEmitter2's `emit` discards the
   * return value, and the tick must not block on Postgres. At shutdown
   * CombatTickService uses `emitAsync`, which does await it, and that is the
   * difference between the hull row being deleted and the process exiting on
   * top of it. A row left at damage >= 100 is re-killed on the next boot with
   * the attacker long gone: no kill credit, no loot, the hold destroyed.
   * @see combat-tick.service.ts beforeApplicationShutdown
   */
  @OnEvent(COMBAT_SHIP_DESTROYED)
  handleCombatShipDestroyed(event: CombatShipDestroyedEvent): Promise<void> {
    const keyParts = event.victimShipKey.split(':');
    const victimShipno = Number(keyParts[keyParts.length - 1]);
    // Read before the hull leaves memory a few lines below — the KILLEDBY
    // announcement at the end of this handler needs it for an AI victim.
    const victimShipName = this.shipNameOf(event.victimShipKey) ?? null;
    // Same reason: canon's `username()` names a PLAYER by their handle
    // (GEFUNCS.C:2596), and ours lives on ShipState.username. Capture it before
    // the hull is evicted or the broadcast falls back to the account key —
    // which is what a pilot saw: "destroyed by usr_27523ed6401c4e990dd98be2!!!"
    const victimHandle = this.handleOf(event.victimShipKey);
    if (!isNaN(victimShipno)) {
      this.scanHandler.clearScantab(event.victimUserid, victimShipno);
    }

    // A destroyed player ship has its hull row deleted and noships decremented.
    // Without this line that happens in complete silence, which made two ships
    // lost during playtesting impossible to tell apart from a bug.
    //
    // It logs the whole MANIFEST because the hull row is about to be deleted
    // (canon's gepdb(GEDELETE)) and the ship-loss mail hardcodes `cash: 0n`
    // and `itemqty: []` — so without this, nothing anywhere records what the
    // pilot actually lost. A sysop asked to make someone whole after a bad
    // death could previously learn only that something of theirs died.
    //
    // WARN, not LOG: this is the line someone goes looking for months later,
    // and it must survive a log level that filters routine chatter.
    // @see docs/DECISIONS.md 2026-09-08 — ship-loss forensics
    this.logger.warn(this.shipLossManifest(event));

    // Delete the victim's hull row and decrement the fleet count atomically — but
    // ONLY for PLAYER ships. AI (status AUTO) hulls are managed by the AI layer
    // (Cybertron/Droid), never here:
    //   • Cybertron rows are PERSISTED and must LINGER after death so the
    //     respawn-slot upsert (createSpawn) can reuse the slot; hydrateAll skips
    //     rows with damage>=100. Deleting the row here would both remove the AI
    //     hull AND, being fire-and-forget, race the respawn upsert → orphan a
    //     freshly-respawned AI ship (in memory, no DB row).
    //   • Droids have no persisted hull row, so deleteMany would be a no-op anyway.
    // Determine player-vs-AI by the victim's status: prefer the in-memory status
    // (the combat emitter still holds the victim in memory at emit time); if the
    // ship was already evicted from memory, fall back to the DB row's status read
    // inside the transaction before deleting.
    // @see GEFUNCS.C:killem gepdb(GEDELETE) — dead PLAYER ships are deleted.
    // Guards (player path):
    //   • deleteMany (not delete) is a no-op when the row is already gone (race safety).
    //   • noships decrement is skipped when count=0 or when noships is already 0
    //     (underflow safety — mirrors C unsigned clamp behaviour).
    let hullWrite: Promise<unknown> = Promise.resolve();
    if (!isNaN(victimShipno)) {
      const inMemoryStatus = this.shipStateService.get(event.victimUserid, victimShipno)?.status;
      hullWrite = this.prisma.$transaction(async (tx) => {
        let status: number | undefined = inMemoryStatus;
        if (status === undefined) {
          const row = await tx.ship.findFirst({
            where: { userid: event.victimUserid, shipno: victimShipno },
            select: { status: true },
          });
          status = row?.status;
        }
        // AI hull — death/persistence owned by the AI layer; never delete or decrement.
        if (status === GESTAT_AUTO) return;

        const { count } = await tx.ship.deleteMany({
          where: { userid: event.victimUserid, shipno: victimShipno },
        });
        if (count > 0) {
          const user = await tx.user.findUnique({
            where: { userid: event.victimUserid },
            select: { noships: true },
          });
          if ((user?.noships ?? 0) > 0) {
            await tx.user.update({
              where: { userid: event.victimUserid },
              data: { noships: { decrement: 1 } },
            });
          }
        }
      }).catch((err: Error) => this.logger.error('death delete/decrement failed', err));
      this.shipStateService.removeFromGame({ userid: event.victimUserid, shipno: victimShipno });
    }

    // Name the killer when it was a planet. Without this the client saw no
    // attacker and no weapon — the same shape a self-destruct produces — and
    // announced the kill as "destroyed by unknown", so a defender was never
    // told their own colony had done it.
    const ionHit = this.lastIonAttacker.get(event.victimId) ?? null;
    this.lastIonAttacker.delete(event.victimId);
    const killedByPlanet = attributePlanetKill({
      hasAttackerShip: event.attackerId !== null,
      lastIonHitAt: ionHit?.at ?? null,
      now: Date.now(),
    });

    // Built field by field, NOT spread from the event.
    //
    // `CombatShipDestroyedEvent` is internal: it drives score transfer, loot,
    // the ship-loss mail and the forensics log. Spreading it into a galaxy-wide
    // emit published the kill's exact SECTOR (a live position feed on anyone
    // who fights), the internal account keys `displayName()` exists to hide —
    // `usr_...` and `Cybrg-NNN`, GEFUNCS.C:2596 username — the destroyed hull's
    // CARGO, and `victimDisconnectReason`, which was added so a SYSOP could
    // tell a closed tab from a dropped connection and is nobody else's
    // business. The client renders four fields; it now receives four.
    // @see docs/audits/2026-09-09-security-review.md
    // @see test/gateway/destroyed-payload-scoping.spec.ts
    const payload = {
      victimId: event.victimId,
      attackerId: event.attackerId,
      weapon: killedByPlanet ? ('ion' as const) : event.weapon,
      // Name the killer. A planet kill takes the planet's name; a ship kill
      // resolves the attacking ship's, because the client's own player list
      // holds live PLAYERS only — an AI killer is never in it, so a Cybertron
      // kill rendered as a bare id or nothing at all and two playtest pilots
      // died repeatedly with no combat text. The hit path already does this.
      attackerName: killedByPlanet
        ? (ionHit?.name ?? null)
        : (event.attackerName ?? (event.attackerId ? this.shipNameOf(event.attackerId) ?? null : null)),
    };
    this.server.emit(COMBAT_SHIP_DESTROYED, payload);

    // KILLEDBY — every pilot in the galaxy hears who killed whom.
    //
    //     prfmsg(KILLEDBY,username(ptr),username(wptr));
    //     outwar(FILTER,usrn,0);
    //
    // GEFUNCS.C:1116-1117, text at MBMGEMSG.MSG:2122. `outwar` is the
    // galaxy-wide send, and the prfmsg sits AFTER the `wptr->status ==
    // GESTAT_AUTO` branch at :1110 — so a Cybertron kill is announced exactly
    // like a player one. The port implemented none of it; a kill three sectors
    // away happened in silence, which is most of why the world read as empty.
    //
    // The labels are canon's `username()` (GEFUNCS.C:2596-2604): the SHIP name
    // for a CYBORG or DROID class, the userid for anyone else.
    //
    // Only a SHIP is announced. Canon's prfmsg lives inside
    // `if (who >= 0 && who < nships && who != usrn)` (GEFUNCS.C:1105), and
    // `fireion` sets the victim's lastfired to -1 (GEFUNCS.C:1797), so a
    // colony's ion cannons make a kill that nobody hears about. The killer's
    // name still travels on the structured payload for the sector to render.
    const hasKillerShip = event.attackerId !== null || event.attackerUserid !== null;
    const killerLabel = !hasKillerShip
      ? null
      : event.attackerUserid && !isAiUserid(event.attackerUserid)
        ? (this.handleOf(event.attackerShipKey) ?? event.attackerUserid)
        : payload.attackerName;
    if (killerLabel) {
      const victimLabel = isAiUserid(event.victimUserid)
        ? (victimShipName ?? event.victimUserid)
        : (victimHandle ?? event.victimUserid);
      // Everyone EXCEPT the pilot who just died, and except anyone who asked
      // not to hear it. Canon is `outwar(FILTER, usrn, 0)` (GEFUNCS.C:1117),
      // and both halves of that call matter:
      //
      //   • `usrn` is the victim's own channel and outwar's loop is
      //     `if (zothusn != exclude && ingegame(zothusn))` (GEMAIN.C:1524) —
      //     the dying pilot is deliberately skipped. They get YOURDEAD
      //     instead, which is a better message and arrives a few lines below.
      //   • FILTER is not decoration. outwar hands it to `outprfge`, which
      //     drops the message for any recipient with `options[MSG_FILTER]`
      //     set: `if (class == FILTER && (warusroff(shpno)->options[MSG_FILTER]
      //     == TRUE)) { clrprf(); return; }` (GEMAIN.C:2562-2567). Compare
      //     ALWAYS at GEMAIN.C:2557-2561, which bypasses the check — that is
      //     the class YOURDEAD and CHGLSR are sent with.
      //
      // The port read User.options[3] into ShipState.msgFilter (GEMAIN.H:236)
      // and then broadcast to everyone regardless, so the one option a pilot
      // has for quieting the galaxy feed did nothing on the noisiest message
      // in the game.
      //
      // Only ships in the map are considered, which is also canon's
      // `ingegame(zothusn)` gate — a user with no ship in the universe is not
      // a recipient at all.
      const filteredRooms = this.shipStateService
        .findAllShips()
        .filter((s) => s.msgFilter)
        .map((s) => `user:${s.userid}`);
      this.server.except([`user:${event.victimUserid}`, ...new Set(filteredRooms)]).emit('event.log', {
        category: 'combat',
        text: formatMessage(MessageId.KILLEDBY, victimLabel, killerLabel),
      });
    } else {
      // DIED — the same announcement for a death no ship caused.
      //
      //     prfmsg(DIED,ptr->shipname,username(ptr));
      //     outwar(ALWAYS,usrn,0);
      //
      // GEFUNCS.C:1262-1264, the `else` of the who-fired guard at :1104. A
      // killer-less death is NOT silent in canon, which is what the port
      // assumed: this covers a self-destruct, a gravity crash, and a colony's
      // ion cannons, since `fireion` sets the victim's lastfired to -1
      // (GEFUNCS.C:1797) and so takes this branch every time.
      //
      // Two differences from KILLEDBY, both canon's:
      //   • the class is ALWAYS, not FILTER, so it reaches pilots who have
      //     muted the galaxy feed (GEMAIN.C:2557-2561). Only the victim is
      //     excluded, by outwar's own `usrn` argument.
      //   • the subject is the SHIP name followed by `username()`, so an
      //     automaton reads as "The X, Commanded by X" — canon's own output,
      //     because username() returns the shipname for a CYBORG or DROID.
      //
      // The React client used to paper over this gap with a line of its own
      // whose fallback printed the raw `Cybrg-NNN` userid — the internal
      // account name username() exists to hide. @see GEFUNCS.C:2596-2604
      const victimLabel = isAiUserid(event.victimUserid)
        ? (victimShipName ?? event.victimUserid)
        : (victimHandle ?? event.victimUserid);
      this.server.except(`user:${event.victimUserid}`).emit('event.log', {
        category: 'combat',
        text: formatMessage(MessageId.DIED, victimShipName ?? victimLabel, victimLabel),
      });
    }

    // The victor may capture the victim's colony list — one kill in six.
    // Canon does this inside killem, after the kill is attributed and before
    // the class kill_func (GEFUNCS.C:1227-1251). Fire-and-forget: a failed
    // lookup must not take the rest of the kill handling down with it.
    if (event.attackerUserid && !isAiUserid(event.attackerUserid)) {
      void this.revealCapturedDocument(event.victimUserid, event.attackerUserid)
        .catch((err: unknown) => {
          const stack = err instanceof Error ? err.stack : String(err);
          this.logger.error(`Captured-document reveal failed: ${stack}`);
        });
    }

    // Tell the pilot who just died that they SURVIVED. C prints YOURDEAD to
    // the victim before killem (GEFUNCS.C:978-987), with outprfge(ALWAYS,usrn)
    // so it bypasses the message filter — this is not flavour, it is the one
    // message that tells a player they escaped, that a Galactic Command
    // freighter picked them up, and that they are back at Zygor with a
    // replacement waiting. The port printed a bare destruction notice, so
    // losing a hull read as the end of the run rather than a setback.
    // @see MBMGEMSG.MSG:2099-2111
    this.server.to(`user:${event.victimUserid}`).emit('event.log', {
      category: 'combat',
      text: formatMessage(MessageId.YOURDEAD),
    });

    // ...and put them somewhere they can play again. The hull row is gone but
    // the socket still holds its shipno, so every subsequent command —
    // `rep`, `mai`, even `hel` — short-circuited to "No active ship." until
    // the player reconnected.
    //
    // Canon does not leave the session in limbo: checkdam prints YOURDEAD,
    // calls killem, then resets `user[usrn].substt = 0` (GEFUNCS.C:999-1004),
    // returning the captain to a state they can act from — which is the whole
    // point of YOURDEAD telling them a freighter dropped them at Zygor.
    //
    // presentShipEntry is the same recovery `abandon` already uses, and its
    // own docstring records why it exists: "without it an abandoned captain sat
    // at a session that answered 'No active ship.' to everything." Death is
    // the same situation and never called it.
    void this.recoverAfterDeath(event.victimUserid);

    // Everything above is synchronous; only the hull write is outstanding.
    return hullWrite.then(() => undefined);
  }

  /**
   * Re-seat a captain whose ship has just been destroyed: another hull if they
   * have one, otherwise onboarding and the free starter at Zygor.
   * Fire-and-forget — a failure here must not disturb the combat tick.
   */
  private async recoverAfterDeath(userid: string): Promise<void> {
    // Defensive throughout: many unit tests supply a minimal server double
    // (just `emit`/`to`), and a death must never throw inside the combat tick.
    const room = this.server?.sockets?.adapter?.rooms?.get(`user:${userid}`);
    if (!room) return;
    for (const socketId of room) {
      const socket = this.server.sockets.sockets?.get(socketId);
      if (!socket) continue;
      socket.data.activeShipNo = undefined;
      try {
        await this.presentShipEntry(socket, userid, { noticeShipLoss: false });
      } catch (err) {
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`Post-death re-entry failed for ${userid}: ${stack}`);
      }
    }
  }

  /** Planet-attack owner alert — emitted from PlanetAttackService.callForHelp. @see GECMDS.C:3952 call_4_help */
  @OnEvent(ATTACK_OWNER_ALERT_EVENT)
  handleAttackOwnerAlert(event: AttackOwnerAlertPayload): void {
    this.server.to(`user:${event.ownerUserid}`).emit('event.log', {
      category: 'system',
      text: event.message,
    });
  }

  /**
   * Gravity-well proximity. C prints GRAVITY1/2/3 for a planet and
   * GRAVWRM1/2/3 for a wormhole as you close on it (GEFUNCS.C:855-885); the
   * innermost band is where the physics tick writes the hull off or throws you
   * through. Without this the effect happened silently.
   */
  /**
   * Hyperspace entry/exit narration.
   *
   * C prints HYSHDN, HYCLDN and HYPERIN as you cross the threshold
   * (GEFUNCS.C:590-601). The port applied the state changes and said nothing,
   * so a pilot who raised shields, jumped to warp and stopped was unshielded
   * with no indication of it. In a playtest that killed a starter Interceptor
   * one sector out from the hub: shields dropped on the jump, stayed down, and
   * a Murdonian took it apart in four hits.
   *
   * Each line is conditional in C, and stays conditional here — announcing
   * "shields down" to someone who never raised them is noise.
   */
  @OnEvent(PHYSICS_HYPERSPACE)
  handlePhysicsHyperspace(event: PhysicsHyperspaceEvent): void {
    const room = `user:${useridOf(event.shipId)}`;
    if (event.direction === 'enter') {
      if (event.shieldsDropped) {
        this.server.to(room).emit('event.log', {
          category: 'combat',
          text: formatMessage(MessageId.HYPER_SHIELDS_DOWN),
        });
      }
      if (event.cloakDropped) {
        this.server.to(room).emit('event.log', {
          category: 'combat',
          text: formatMessage(MessageId.HYPER_CLOAK_DOWN),
        });
      }
      this.server.to(room).emit('event.log', {
        category: 'system',
        text: formatMessage(MessageId.HYPER_IN),
      });

      // `prfmsg(HYPERIN2,ptr->shipname); outsect(FILTER,&coord,usrn,0);`
      // — the SECTOR is told, not just the pilot (GEFUNCS.C:605-606). The port
      // emitted nothing here, so a ship leaving a fight vanished silently and
      // whoever it was fighting had no way to know it had jumped rather than
      // simply outrun them.
      if (event.sector) {
        // `outsect(FILTER,&coord,usrn,0)` — the third argument is an
        // EXCLUSION (`zothusn != exclude`, GEMAIN.C outsect), and canon passes
        // the JUMPING ship. Without the except() the pilot was told "Sensors
        // indicate The <their own ship> has gone to Hyper Space, Sir!" about
        // themselves, immediately after being told they were entering it.
        this.server
          .to(`sector:${event.sector.x}:${event.sector.y}`)
          .except([room])
          .emit('event.log', {
            category: 'nav',
            text: formatMessage(MessageId.HYPER_IN_SECTOR, event.shipname ?? 'ship'),
          });
      }
      return;
    }
    this.server.to(room).emit('event.log', {
      category: 'system',
      text: formatMessage(MessageId.HYPER_OUT),
    });
  }

  /**
   * Mine proximity warning.
   *
   * C prints MINE6 with bearing and distance for a mine in range that has not
   * armed yet, and suppresses it while the ship is jammed (GEFUNCS.C:1472-1478).
   * The port emitted the event and nothing listened, so mines gave NO warning
   * at all — and a mine does up to MNDAMMAX to a hull that dies at 100.
   */
  /**
   * The half of combat canon addresses to the VICTIM.
   *
   *   prfmsg(LOCK2,shpltr(ship,usrn)); outprfge(FILTER,ship);   // good lock
   *   prfmsg(LOCK4,shpltr(ship,usrn)); outprfge(FILTER,ship);   // failed lock
   *
   * @see GECMDS.C:1401, :1415
   *
   * Addressed to the target's own room and nowhere else: canon does not tell
   * the sector, and LOCK1 — the firer's confirmation — is commented out in the
   * original, so the firer learns nothing from a successful lock.
   */
  @OnEvent(COMBAT_TARGET_WARNING)
  handleCombatTargetWarning(event: CombatTargetWarningEvent): void {
    const messageId = {
      'lock-acquired': MessageId.LOCK_WARN_ACQUIRED,
      'lock-attempt': MessageId.LOCK_WARN_ATTEMPT,
      'torpedo-launched': MessageId.TORP_INBOUND,
      'missile-launched': MessageId.MISSILE_INBOUND,
      'torpedo-inbound': MessageId.TORP_TRACKING,
      'missile-inbound': MessageId.MISSILE_TRACKING,
      'scanners-jammed': MessageId.JAMMER3_JAMMED,
    }[event.kind];

    // Canon resolves the letter AT PRINT TIME, against the scan table of the
    // user being printed to: `prfmsg(TFIRE2, shpltr(shpnum, usrn))` where
    // `shpnum` is the victim (GECMDS.C:1198). `shpltr` walks that victim's
    // scantab and answers '?' if the firer is not in it (GEFUNCS.C:2578).
    //
    // So do it here, where the viewer is known, rather than trusting whatever
    // the emitter computed. The Cybertron path had been deriving the letter
    // from the ATTACKER's channel number, which produced warnings naming ships
    // the pilot had never scanned ("Incoming torpedo from ship R" with no R on
    // the scan) and could just as easily have named a letter belonging to a
    // DIFFERENT contact in their table.
    const letter = event.attackerId
      ? shipLetter(
          this.scanHandler.lettersFor(useridOf(event.victimId), shipnoOf(event.victimId)),
          event.attackerId,
        )
      : event.attackerLetter;

    this.server.to(`user:${useridOf(event.victimId)}`).emit('event.log', {
      category: 'combat',
      text: formatMessage(messageId, letter),
    });
  }

  /**
   * A ship caught in someone's self-destruct. Two lines, because shields
   * deflecting the blast reads differently from taking it bare, and the figure
   * is a damstr word. Addressed to that victim alone — canon uses
   * `outprfge(ALWAYS,zothusn)` inside the per-ship loop.
   * @see GEFUNCS.C:1878-1891
   */
  @OnEvent(COMBAT_DESTRUCT_BLAST)
  handleDestructBlast(event: CombatDestructBlastEvent): void {
    this.server.to(`user:${useridOf(event.victimId)}`).emit('event.log', {
      category: 'combat',
      text: formatMessage(
        event.shieldUp ? MessageId.DESTRUCT_BLAST_DEFLECTED : MessageId.DESTRUCT_BLAST_HIT,
        damstr(event.damage),
      ),
    });
  }

  /**
   * Damage Control reporting a system back online, to that ship alone.
   * @see GEFUNCS.C:1021 PHREPR, :1059 TAREPR, :1070 HLREPR, :1080 FCREPR
   */
  @OnEvent(SHIP_SYSTEM_REPAIRED)
  handleSystemRepaired(event: ShipSystemRepairedEvent): void {
    const messageId = {
      phaser: MessageId.REPAIR_PHASER,
      tactical: MessageId.REPAIR_TACTICAL,
      helm: MessageId.REPAIR_HELM,
      firecntl: MessageId.REPAIR_FIRECNTL,
    }[event.system];
    this.server.to(`user:${useridOf(event.shipId)}`).emit('event.log', {
      category: 'system',
      text: formatMessage(messageId),
    });
  }

  /**
   * The bank reporting it can fire, or that it is full.
   * @see GEFUNCS.C:1037 PHSRUP, :1046 PHSRMAX
   */
  @OnEvent(SHIP_PHASER_CHARGE)
  handlePhaserCharge(event: ShipPhaserChargeEvent): void {
    this.server.to(`user:${useridOf(event.shipId)}`).emit('event.log', {
      category: 'system',
      text: formatMessage(
        event.level === 'minimum' ? MessageId.PHASER_MIN_POWER : MessageId.PHASER_FULL_POWER,
      ),
    });
  }

  /**
   * State transitions the captain is told about but does not initiate.
   * @see GEFUNCS.C:1345, :2486, :1724, :1392, :422, :399
   */
  @OnEvent(SHIP_STATUS_NOTICE)
  handleStatusNotice(event: ShipStatusNoticeEvent): void {
    const messageId = {
      'shields-no-power': MessageId.SHIELDS_NO_POWER,
      'shields-repaired': MessageId.SHIELDS_REPAIRED,
      'cloak-full': MessageId.CLOAK_FULL,
      'cloak-repaired': MessageId.CLOAK_REPAIRED,
      'maint-complete': MessageId.MAINT_COMPLETE,
      'maint-interrupted': MessageId.MAINT_INTERRUPTED,
    }[event.notice];
    this.server.to(`user:${useridOf(event.shipId)}`).emit('event.log', {
      category: 'system',
      text: formatMessage(messageId),
    });
  }

  /**
   * The killer's salvage and score report.
   *
   *   prfmsg(KILLGOT1,ptr->shipname);   then `prf(", %s %s")` per item
   *   prfmsg(KILLPNTS,gechrbuf,shipclass[ptr->shpclass].typename);
   *
   * @see GEFUNCS.C:1120-1136, :1187
   *
   * Addressed to the killer alone. A self-destruct has no attacker and reports
   * nothing — canon runs this inside the `who` branch of killem.
   */
  @OnEvent(COMBAT_SHIP_DESTROYED)
  handleKillReport(event: CombatShipDestroyedEvent): void {
    if (!event.attackerUserid) return;

    const shipname = event.victimShipname ?? 'ship';
    const flotsam = event.loot
      .map((l) => `, ${l.amount} ${ITEM_NAMES[l.itemIndex] ?? 'items'}`)
      .join('');
    // Canon closes the sentence unconditionally — `prf(".\r")`, GEFUNCS.C:1141
    // — whether or not anything was collected. Without it a kill that salvaged
    // nothing rendered as a bare "We have retrieved", which reads as a message
    // truncated mid-render rather than as "we got nothing". An empty haul is
    // the COMMON case, not an edge one: `chkweight` refuses every item that
    // will not fit, so any captain flying near their tonnage limit sees this
    // on every kill.
    this.server.to(`user:${event.attackerUserid}`).emit('event.log', {
      category: 'combat',
      text: `${formatMessage(MessageId.KILL_SALVAGE, shipname)}${flotsam}.`,
    });

    if (event.scoreAwarded > 0) {
      const typeName = (event.victimClass !== undefined
        ? this.shipClassCache.getTypeName(event.victimClass)
        : undefined) ?? 'ship';
      this.server.to(`user:${event.attackerUserid}`).emit('event.log', {
        category: 'combat',
        text: formatMessage(MessageId.KILL_POINTS, String(event.scoreAwarded), typeName),
      });
    }
  }

  @OnEvent(COMBAT_MINE_WARNING)
  handleCombatMineWarning(event: CombatMineWarningEvent): void {
    this.server.to(`user:${useridOf(event.victimId)}`).emit('event.log', {
      category: 'combat',
      text: formatMessage(MessageId.MINE6, event.bearing, event.distance),
    });
  }

  /**
   * Striking the galactic perimeter.
   *
   * telezip zeroes speed and speed2b and applies TELEDAM, then prints TELEPORT
   * (GEFUNCS.C:819-833). Emitted without a listener when UNIVWRAP was
   * implemented, which would have left a pilot stopped dead and damaged with no
   * explanation — the same silence this commit removes elsewhere.
   */
  @OnEvent(PHYSICS_UNIVERSE_EDGE)
  handlePhysicsUniverseEdge(event: PhysicsUniverseEdgeEvent): void {
    this.server.to(`user:${useridOf(event.shipId)}`).emit('event.log', {
      category: 'combat',
      text: `** You strike the galactic perimeter. All way comes off and the hull takes ${event.damage} damage. **`,
    });
  }

  /**
   * Shield charge narration — SHLDAT each tick while charging, SHLDUP at full
   * (GEFUNCS.C:2515-2523). Captain's own socket only; C uses
   * `outprfge(FILTER,usrn)`, not a sector broadcast.
   */
  @OnEvent(SHIP_SHIELD_CHARGE)
  handleShipShieldCharge(event: ShipShieldChargeEvent): void {
    this.server.to(`user:${useridOf(event.shipId)}`).emit('event.log', {
      category: 'system',
      text: event.kind === 'full'
        ? formatMessage(MessageId.SHLDUP)
        : formatMessage(MessageId.SHLDAT, event.percent),
    });
  }

  /**
   * The helm answering the throttle — SPEEDIS, or SPEED0 on a dead stop.
   *
   * `showarp` renders speed as "%.2f" warp factors (GEFUNCS.C:2681), so the
   * fraction is hundredths and is zero-padded; SPEEDIS's own "%d point %d"
   * cannot be taken literally because canon feeds it showarp's STRING, which is
   * a varargs bug. @see src/game/physics/speed-events.ts
   */
  @OnEvent(SHIP_SPEED_REPORT)
  handleShipSpeedReport(event: ShipSpeedReportEvent): void {
    // SPEEDIS {***\nHelm reports speed is now Warp %s, Sir!} takes ONE arg —
    // canon's showarp figure. The port split the number and printed "warp 10
    // point 00", a form nothing else in the game uses. @see GEFUNCS.C:2674
    const text = event.speed <= 0
      ? formatMessage(MessageId.SPEED0)
      : formatMessage(MessageId.SPEEDIS, showarp(event.speed));
    this.server.to(`user:${event.userid}`).emit('event.log', { category: 'system', text });
  }

  /**
   * A warp jump shook the missiles off. Canon prints MISSL2 once, however many
   * were tracking, to the captain's own socket — `outprfge(FILTER, usrn)`.
   * @see GEFUNCS.C:517-520
   */
  /**
   * The WARP ladder — one rung per integer warp factor crossed, both ways.
   * `outprfge(FILTER, usrn)`: the captain's own socket. @see GEFUNCS.C:498
   */
  @OnEvent(SHIP_WARP_PROGRESS)
  handleWarpProgress(event: ShipWarpProgressEvent): void {
    this.server.to(`user:${event.userid}`).emit('event.log', {
      category: 'system',
      text: formatMessage(MessageId.HELM_WARP, event.warp),
    });
  }

  /**
   * The engines quitting. `outprfge(ALWAYS, usrn)` in canon — this one cannot
   * be filtered away, which is why it is 'alert' rather than 'system'.
   *
   * NOACCEL interpolates `(int)ptr->speed`, the RAW speed, so the line reads
   * "engine shutdown at warp 3000". That is canon's own varargs quirk and it is
   * reproduced rather than quietly corrected. @see GEFUNCS.C:528
   */
  @OnEvent(SHIP_ENGINE_SHUTDOWN)
  handleEngineShutdown(event: ShipEngineShutdownEvent): void {
    this.server.to(`user:${event.userid}`).emit('event.log', {
      category: 'alert',
      text: formatMessage(MessageId.HELM_NOACCEL, event.speed),
    });
  }

  @OnEvent(SHIP_MISSILE_SHAKEN)
  handleMissileShaken(event: ShipMissileShakenEvent): void {
    this.server.to(`user:${event.userid}`).emit('event.log', {
      category: 'combat',
      text: formatMessage(MessageId.MISSL2),
    });
  }

  @OnEvent(PHYSICS_GRAVITY)
  handleGravity(event: PhysicsGravityEvent): void {
    const userid = event.shipId.split(':')[0];
    const body = event.isWormhole ? `wormhole ${event.plnum}` : `planet ${event.plnum}`;
    const text =
      event.band === 1
        ? `You feel the pull of ${body}.`
        : event.band === 2
          ? `WARNING: ${body} is dragging you in — break away now.`
          : event.isWormhole
            ? `The wormhole takes you.`
            : `You have flown into ${body}.`;

    this.server.to(`user:${userid}`).emit('event.log', {
      category: event.band === 3 ? 'combat' : 'system',
      text,
    });
  }

  /** SELFD4 — reaching neutral space cancels an armed countdown. @see GEFUNCS.C:725-730 */
  @OnEvent(PHYSICS_DESTRUCT_CANCELLED)
  handleDestructCancelled(event: PhysicsDestructCancelledEvent): void {
    const userid = event.shipId.split(':')[0];
    this.server.to(`user:${userid}`).emit('event.log', {
      category: 'system',
      text: 'Entering neutral space — the self-destruct sequence has been cancelled.',
    });
  }

  /**
   * IHIT1 / IHIT2 — a planet you attacked has fired its ion cannons at you.
   * @see GEFUNCS.C:1799, 1805
   */
  @OnEvent(PLANET_ION_FIRED)
  handlePlanetIonFired(event: PlanetIonFiredEvent): void {
    const name = event.planetName || `planet ${event.plnum}`;
    // Remember who is shooting so a kill this tick can name the planet. The
    // kill itself carries no attacker — `fireion` sets lastfired to -1 — and
    // neither this gateway nor CombatTickService can reach planet state, so
    // the name has to come from the hit that caused the death.
    this.lastIonAttacker.set(event.shipId, { name, at: Date.now() });
    const text = event.shieldsUp
      ? `** ION CANNON from ${name}! Shields absorb it — hull -${event.hullDamage}%, shields knocked ${event.shieldKnock}% **`
      : `** ION CANNON from ${name}! Hull -${event.hullDamage}% — raise shields! **`;

    this.server.to(`user:${useridOf(event.shipId)}`).emit('event.log', {
      category: 'combat',
      text,
    });
  }

  /** Per-captain cloak-collapsed notification (energy starvation). @see GEFUNCS.C:1374 */
  @OnEvent('ship-management.cloak-collapsed')
  handleCloakCollapsed(event: CloakCollapsedPayload): void {
    this.server.to(`user:${event.userid}`).emit('event.log', {
      category: 'system',
      text: event.message,
    });
  }

  /**
   * Self-destruct countdown tick. Two audiences, per canon: the pilot always
   * gets the number (SELFD2), the sector only hears anything at 10, 5 and 2.
   * @see GEFUNCS.C:1833-1852
   */
  @OnEvent('ship-management.destruct-tick')
  handleDestructTick(event: DestructTickPayload): void {
    this.server.to(`user:${event.userid}`).emit('event.log', {
      category: 'system',
      text: event.pilotMessage,
    });
    if (event.sectorMessage !== null) {
      this.server.to(event.room).emit('event.log', {
        category: 'system',
        text: event.sectorMessage,
      });
    }
  }

  /** Self-destruct expiring: SELFD3 to the pilot, SELFD3A to the sector. @see GEFUNCS.C:1856-1859 */
  @OnEvent('ship-management.destruct-boom')
  handleDestructBoom(event: DestructBoomPayload): void {
    this.server.to(`user:${event.userid}`).emit('event.log', {
      category: 'combat',
      text: event.pilotMessage,
    });
    this.server.to(event.room).emit('event.log', {
      category: 'combat',
      text: event.sectorMessage,
    });
  }

  /**
   * @see GECYBS.C:379 cyb_annoy
   */
  @OnEvent(CYBERTRON_EVENT.TAUNT)
  handleCybertronTaunt(event: CybertronTauntPayload): void {
    // C addresses the taunt to the TARGET's terminal — `outprfge(FILTER, usrn)`
    // where usrn is the player being taunted (GECYBS.C:398-401) — not to
    // whoever happens to share a sector with the Cybertron.
    //
    // This is load-bearing. Scan ranges are asymmetric: an Obliterator sees
    // six sectors and an Interceptor one and a half, so the thing hunting you
    // is routinely outside your own scanners and opens fire from there. The
    // taunt is the only warning the game gives, and sending it to the
    // attacker's sector room meant the target never received it.
    //
    // ONE emit, two rooms. Socket.io de-duplicates across rooms within a single
    // emit but not across two calls, so the previous pair of `.emit()`s sent
    // every taunt TWICE to a target standing in the taunter's own sector — the
    // ordinary case, since that is where a Cybertron does its taunting.
    // Bystanders in that sector still see the exchange.
    this.server
      .to(`user:${useridOf(event.targetShipKey)}`)
      .to(`sector:${event.sector.x}:${event.sector.y}`)
      .emit(CYBERTRON_EVENT.TAUNT, event);
  }

  /** @see GECYBS.C:255 CYB_BREAKOFF roll */
  @OnEvent(CYBERTRON_EVENT.BROKE_OFF)
  handleCybertronBrokeOff(event: CybertronBrokeOffPayload): void {
    const parts = event.targetShipKey.split(':');
    const targetUserid = parts.slice(0, -1).join(':');
    const targetShipno = Number(parts[parts.length - 1]);
    const targetShip = this.shipStateService.get(targetUserid, targetShipno);
    const sector = targetShip
      ? { x: Math.floor(targetShip.xcoord), y: Math.floor(targetShip.ycoord) }
      : event.sector;
    // CYBLUCK goes to the pilot being let off the hook — `outprfge(FILTER,
    // zothusn)` (GECYBS.C:258-260) — with the sector seeing it too.
    this.server.to(`user:${targetUserid}`).emit(CYBERTRON_EVENT.BROKE_OFF, event);
    this.server.to(`sector:${sector.x}:${sector.y}`).emit(CYBERTRON_EVENT.BROKE_OFF, event);
  }

  /**
   * Broadcast sector-transition event to all clients (for ScanMap clear etc.)
   * and emit MOVE2/MOVE3 sector-entry notices to the affected sector rooms.
   *
   * MOVE2: "X has left the sector." → emitted to fromSector room
   * MOVE3: "X has entered the sector." → emitted to toSector room
   * Both only fire when speed < 21000 (not at high warp) — faithful to
   * GEFUNCS.C:714 which gates on `ptr->speed < 21000.0`.
   *
   * @see GEFUNCS.C:709-723 moveship sector-change branch
   * @see GEFUNCS.C:711 MOVE1 prfmsg (the mover's own "you have moved" line)
   * @see GEFUNCS.C:716 MOVE2 prfmsg (left sector, mover excluded)
   * @see GEFUNCS.C:721 MOVE3 prfmsg (entered sector, mover excluded)
   */
  @OnEvent(PHYSICS_SECTOR_TRANSITION)
  handleSectorTransition(event: PhysicsSectorTransitionEvent): void {
    const { shipId, fromSector, toSector } = event;

    const movingShip = this.shipStateService.findAllShips().find((s) => shipKey(s.userid, s.shipno) === shipId);

    // This event carries the mover's RAW x/y — finer than a sector — and used
    // to go to every connected client on every boundary crossing. That was a
    // live position feed for all 24 Cybertrons and every droid, and, once
    // `who` stopped publishing player sectors, for every player too.
    //
    // Its one consumer is the mover's own ScanMap, which clears when the local
    // ship changes sector (FR-013), so the mover is the whole audience. The
    // status gate stays as a second lock: an AI has no socket to send to, but
    // nothing should depend on that staying true.
    // @see transition-visibility.ts, player-visibility.ts
    const moverSocketId = this.registry.getSocketId(shipId);
    if (shouldBroadcastTransition(movingShip?.status) && moverSocketId) {
      this.server.sockets.sockets.get(moverSocketId)?.emit('physics.sector-transition', event);
    }

    if (fromSector.x === toSector.x && fromSector.y === toSector.y) return;
    if (!movingShip) return;

    // Position is scoped to your own sector, so a crossing changes what three
    // audiences may see: the sector entered gains the mover, the sector left
    // loses them, and the mover's own view of everyone else flips both ways.
    // Nobody else's view changed, so nobody else is told. @see player-visibility.ts
    if (shouldBroadcastTransition(movingShip.status)) {
      this.server
        .to(`sector:${toSector.x}:${toSector.y}`)
        .emit('player.sector', { updates: [{ shipId, sector: toSector }] });
      this.server
        .to(`sector:${fromSector.x}:${fromSector.y}`)
        .emit('player.sector', { updates: [{ shipId, sector: null }] });

      // The mover's own row is included explicitly: their socket does not join
      // `sector:to` until further down this method, so the arrival broadcast
      // above does not reach them and their own position would go stale.
      const forMover = [
        { shipId, sector: toSector },
        ...moverVisibilityUpdates(this.registry.list(), shipId, fromSector, toSector),
      ];
      if (moverSocketId) {
        this.server.sockets.sockets.get(moverSocketId)?.emit('player.sector', { updates: forMover });
      }
    }

    // Move the player's socket to the new sector room so they receive sector-scoped events.
    const socketId = moverSocketId;
    if (socketId) {
      const playerSocket = this.server.sockets.sockets.get(socketId);
      if (playerSocket) {
        void playerSocket.leave(`sector:${fromSector.x}:${fromSector.y}`);
        void playerSocket.join(`sector:${toSector.x}:${toSector.y}`);
      }
    }

    // Gate: no notices at high warp (speed >= 21000) — GEFUNCS.C:714
    const name = movingShip.shipname;

    // C tells the mover they moved, and tells the two sectors about them while
    // EXCLUDING the mover: `outsect(FILTER, &sect, usrn, 0)` (GEFUNCS.C:717,722).
    // Without the exclusion a pilot was told "<their own ship> has entered the
    // sector" on every boundary crossing, because their socket joins the
    // destination room just above; and without MOVE1 nothing told them they had
    // changed sector at all.
    //
    // MOVE1 is UNCONDITIONAL. Only the two sector broadcasts carry the
    // `ptr->speed < 21000.0` gate (GEFUNCS.C:714, :719); the mover's own line
    // sits above it at :711-713. The port returned early on the gate and
    // silenced all three, so a ship above warp 21 crossed boundaries with no
    // running account of where it was. Nothing surfaced it until a hull that
    // fast existed in play: the starting classes cap at warp 10 and it took a
    // Dreadnought at warp 50 to find.
    if (socketId) {
      this.server.sockets.sockets.get(socketId)?.emit('event.log', {
        category: 'nav',
        text: `You have moved from sector (${fromSector.x}, ${fromSector.y}) to (${toSector.x}, ${toSector.y}).`,
      });
    }

    // Gate: no SECTOR notices at high warp — you are through too fast to be
    // seen. @see GEFUNCS.C:714, :719
    if (movingShip.speed >= 21000) return;

    this.server
      .to(`sector:${fromSector.x}:${fromSector.y}`)
      .except(socketId ?? '')
      .emit('sector:ship-left', { shipId, shipName: name });

    this.server
      .to(`sector:${toSector.x}:${toSector.y}`)
      .except(socketId ?? '')
      .emit('sector:ship-entered', { shipId, shipName: name });

    // S-005: beacon-on-move (GEFUNCS.C:808-816). Re-emit BEACON_EVENT when:
    //   (a) at least one OBSERVER ship is in the destination sector
    //       (status === GESTAT_USER (1) or GESTAT_AUTO (2), excluding mover)
    //   (b) gernd()%10 === 0 (1-in-10 probability gate from C source)
    // Restores audit 020 F-005 which regressed in commit d75d337.
    const allShips = this.shipStateService.findAllShips();
    const hasObserver = allShips.some(
      (s) =>
        shipKey(s.userid, s.shipno) !== shipId &&
        Math.floor(s.xcoord) === toSector.x &&
        Math.floor(s.ycoord) === toSector.y &&
        (s.status === 1 || s.status === 2),
    );
    if (!hasObserver) return;
    if (gernd(this.random) % 10 !== 0) return;

    const beaconPayload: BeaconEvent = {
      shipId,
      shipName: name,
      // Flat sector id, offset so the -UNIVMAX..+UNIVMAX square maps to 0..n.
      fromSector: (fromSector.y + UNIVMAX) * (UNIVMAX * 2 + 1) + (fromSector.x + UNIVMAX),
      toSector: (toSector.y + UNIVMAX) * (UNIVMAX * 2 + 1) + (toSector.x + UNIVMAX),
    };
    this.server.to(`sector:${toSector.x}:${toSector.y}`).emit(BEACON_EVENT, beaconPayload);
  }

  /**
   * @see GEDROIDS.C:237 droid_annoy
   */
  @OnEvent(DroidEvents.ANNOY)
  handleDroidAnnoy(event: DroidAnnoyEvent): void {
    // `user:<userid>` — the only per-captain room the gateway joins (see
    // handleConnection). This read `to:<userid>:<shipno>`, which nothing ever
    // joins, so the targeted half of the delivery went nowhere; it survived
    // only because a droid is usually in its victim's sector anyway.
    const targetRoom = `user:${event.toUserid}`;
    const sectorRoom = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(targetRoom).to(sectorRoom).emit(DroidEvents.ANNOY, event);
  }

  /**
   * Bridge droid spawn to the sector room where it appeared.
   * Frontend uses this to add ephemeral droids to the sector roster.
   * @see GEDROIDS.C:98 droid_init
   */
  @OnEvent(DroidEvents.SPAWNED)
  handleDroidSpawned(event: DroidSpawnedEvent): void {
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(DroidEvents.SPAWNED, event);
    this.announceAiArrival(MessageId.DROID_NEW);
  }

  /**
   * A new Cybertron. Galaxy-wide, FILTER class, with a bearing that is pure
   * decoration: `prfmsg(CYBNEW,gernd()%359); outwar(FILTER,usrn,0)`.
   * @see GECYBS.C:186
   */
  @OnEvent(CYBERTRON_EVENT.SPAWNED)
  handleCybertronSpawned(_event: CybertronSpawnedPayload): void {
    this.announceAiArrival(MessageId.CYB_NEW);
  }

  /**
   * The shared body of CYBNEW and DROIDNEW.
   *
   * The bearing is `gernd()%359` — a RANDOM number with no relationship to
   * where the ship actually is. That is canon's intent, not a shortcut: the
   * line is a sensor contact rather than a fix, and feeding it the real bearing
   * would turn a piece of atmosphere into a tracker that canon never gave you.
   */
  private announceAiArrival(messageId: MessageId): void {
    this.server.except(this.filteredRooms()).emit('event.log', {
      category: 'combat',
      text: formatMessage(messageId, gernd(this.random) % 359),
    });
  }

  /**
   * Bridge droid kill to the sector room (roster update) and global kills channel.
   * @see GEDROIDS.C:534 droid_died
   */
  @OnEvent(DroidEvents.KILLED)
  handleDroidKilled(event: DroidKilledEvent): void {
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(DroidEvents.KILLED, event);
    this.server.to('kills').emit(DroidEvents.KILLED, event);
  }

  /**
   * Emits command result events to the issuing socket.
   *
   * When `result.scanRender` is present, emits two disjoint events:
   *   - `command:result` — a single `info`-category line with the header text only (for the EventLog).
   *   - `scan:render` — the full `ScanRenderEvent` payload (for the ScanPanel).
   *
   * When `result.scanRender` is absent, emits only `command:result` with whatever
   * lines the handler returned.
   *
   * Neither event is broadcast to a room — both are unicast to the issuing socket.
   *
   * @see specs/015-scan-modes/contracts/scan-render.md §1 ("Event routing canonical")
   */
  emitCommandResult(client: GameSocket, result: import('../game/commands/command.types').CommandResult): void {
    if (result.expectFollowup !== undefined) {
      client.data.pendingFollowup = result.expectFollowup;
    }
    if (result.fkeys) client.emit('fkeys.snapshot', { fkeys: result.fkeys });

    if (result.scanRender) {
      // Send the handler's OWN lines, not a synthesised header. This used to
      // rebuild `[{ text: scanRender.header }]` unconditionally, which quietly
      // undid the de-duplication done in the handler: `sca lo full` returns no
      // line precisely because its SCAN DATA card already shows the header,
      // and the gateway put it back. The other scan modes carry their header
      // in `lines` already, so passing them through is correct for all four.
      // Destructured out, not set to undefined: spreading with an explicit
      // `undefined` leaves the KEY present, and the contract is that
      // command:result carries no render payload.
      const { scanRender: _render, ...withoutRender } = result;
      void _render;
      client.emit('command:result', withoutRender);
      client.emit('scan:render', result.scanRender);
    } else {
      client.emit('command:result', result);
    }
  }

  /**
   * Processes the optional `broadcasts` array from a CommandResult.
   *
   * Special rooms handled here:
   *   `__player_snapshot__` — triggers global player.snapshot emit.
   *   `galaxy`              — broadcasts to all connected sockets unfiltered.
   *   `hail`                — broadcasts to all connected sockets, filtering cloaked ships.
   *   `sector:{x}:{y}`      — forwarded to the named Socket.io room as-is.
   *
   * @see GECMDS.C:1825 cmd_send — outwar FILTER (hail) / outsect / outwar ALWAYS (galaxy)
   * @see specs/012-social-commands/contracts/commands.md §sen
   * @see specs/011-onboarding/plan.md §rename-broadcasts
   */
  private processBroadcasts(
    result: import('../game/commands/command.types').CommandResult,
    sender?: GameSocket,
  ): void {
    if (!result.broadcasts) return;
    for (const broadcast of result.broadcasts) {
      const excludeId = broadcast.excludeSelf ? sender?.id : undefined;

      if (broadcast.event === 'player.snapshot') {
        this.emitScopedSnapshotToAll();
      } else if (broadcast.freq !== undefined) {
        // Tuned transmission — only ships carrying this frequency on one of
        // their three channels hear it. @see GEMAIN.C:2583 outsect / outwar
        const members =
          broadcast.room === 'galaxy' ? undefined : this.roomMembers(broadcast.room);
        this.emitToSockets(broadcast, members, excludeId, (ship) =>
          ship.freq.includes(broadcast.freq as number),
        );
      } else if (broadcast.room === 'galaxy') {
        // Galaxy-wide: all connected sockets, no filtering
        this.dispatchBroadcast(this.server, broadcast);
      } else if (broadcast.room.startsWith('ship:')) {
        // A message addressed to ONE pilot, the way C writes to a single
        // terminal with `outprfge(FILTER, shpnum)`. Used by `sca sh` to tell
        // a ship it has been scanned. @see GECMDS.C:2280
        const [, uid, shipnoRaw] = broadcast.room.split(':');
        const shipno = Number(shipnoRaw);
        this.emitToSockets(
          broadcast,
          undefined,
          excludeId,
          (ship) => ship.userid === uid && ship.shipno === shipno,
        );
      } else if (broadcast.room === 'hail') {
        // Hail: every ship in the game hears it. `outwar` (GEMAIN.C:1518-1540)
        // delivers to every `ingegame` ship and never examines cloak —
        // running silent hides you from scanners, not from your own radio.
        // @see GECMDS.C:1845
        this.emitToSockets(broadcast, undefined, excludeId, () => true);
      } else {
        this.dispatchBroadcast(this.server.to(broadcast.room), broadcast);
      }
    }
  }

  /** Socket ids currently in `room`, or an empty set when the room is gone. */
  private roomMembers(room: string): Set<string> {
    return this.server.sockets.adapter.rooms.get(room) ?? new Set<string>();
  }

  /**
   * Emits `broadcast` on `target`, narrowing `broadcast.event` so
   * `broadcast.payload` is checked against the ONE wire payload type that
   * event actually carries, rather than passing a union `event` and an
   * unrelated `payload` to a single `.emit()` call (which the typed
   * `Server`/`Socket` generics correctly refuse — `event` and `payload` are
   * a discriminated union on `CommandBroadcast`, and Socket.io's overloaded
   * `emit` cannot verify that correlation across a union without this
   * per-branch narrowing).
   *
   * `'player.snapshot'` never reaches here — `processBroadcasts` resolves it
   * to `emitScopedSnapshotToAll()` before any target-based dispatch. The case
   * exists only so this switch is exhaustive over `CommandBroadcast['event']`.
   */
  private dispatchBroadcast(target: BroadcastTarget, broadcast: CommandBroadcast): void {
    switch (broadcast.event) {
      case 'command.notice':
        target.emit('command.notice', broadcast.payload);
        return;
      case 'event.log':
        target.emit('event.log', broadcast.payload);
        return;
      case 'message.send':
        target.emit('message.send', broadcast.payload);
        return;
      case 'ship.renamed':
        target.emit('ship.renamed', broadcast.payload);
        return;
      case 'player.snapshot':
        return;
      default: {
        // Exhaustiveness check, not dead code: if `CommandBroadcast` ever
        // grows a sixth `event` variant, every case above still compiles —
        // `broadcast.event` would just be a value the switch does not
        // recognise, and the broadcast would silently vanish at runtime
        // exactly like the pre-fix probe test this switch replaced. Assigning
        // the unhandled remainder to `never` makes that a compile error
        // instead: TypeScript can only narrow `broadcast` to `never` here if
        // every union member was already matched above.
        const _exhaustive: never = broadcast;
        return _exhaustive;
      }
    }
  }

  /**
   * Emits `broadcast` to every socket whose active ship satisfies `accept`.
   *
   * `members` limits the sweep to one room's socket ids; omit it to consider
   * every connected socket. `excludeId` drops the sender, which C does by
   * passing `usrnum` to outsect/outwar.
   */
  private emitToSockets(
    broadcast: CommandBroadcast,
    members: Set<string> | undefined,
    excludeId: string | undefined,
    accept: (ship: ShipState) => boolean,
  ): void {
    const ids = members ?? this.server.sockets.sockets.keys();
    for (const socketId of ids) {
      if (socketId === excludeId) continue;
      const sock = this.server.sockets.sockets.get(socketId);
      if (!sock) continue;
      const uid = sock.data.userid as string | undefined;
      const shipno = sock.data.activeShipNo as number | undefined;
      if (uid == null || shipno == null) continue;
      const ship = this.shipStateService.get(uid, shipno);
      if (!ship || !accept(ship)) continue;
      this.dispatchBroadcast(sock, broadcast);
    }
  }

}
