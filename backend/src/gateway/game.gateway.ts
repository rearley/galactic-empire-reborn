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
import { UNIVMAX, GESTAT_AUTO, GESTAT_USER, MAXPLRS } from '../game/constants';
import { ShipStateService } from '../game/ship/ship-state.service';
import { ShipClassCacheService } from '../game/physics/ship-class-cache.service';
import { CommandRouterService } from '../game/commands/command-router.service';
import { ScanHandlerService } from '../game/commands/handlers/scan.handler';
import {
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  COMBAT_MINE_DETONATION,
  COMBAT_MINE_WARNING,
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
import { SHIP_OVERSPEED, ShipOverspeedEvent } from '../game/ship/overspeed-events';
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
import { SHIP_SHIELD_CHARGE, ShipShieldChargeEvent } from '../game/ship/shield-events';
import {
  SHIP_MISSILE_SHAKEN,
  SHIP_SPEED_REPORT,
  ShipMissileShakenEvent,
  ShipSpeedReportEvent,
} from '../game/physics/speed-events';
import { formatMessage, MessageId } from '../game/commands/messages';
import { damstr } from '../game/combat/combat-math';
import { attackerNameFromLastFired, resolveKillSpoils } from '../game/combat/kill-resolution';
import { isAiUserid } from '../game/commands/helpers/ai-userid';
import { MESG_SHIPLOSS } from '../game/player/ship-loss-mail.service';
import { MAIL_CLASS_DISTRESS } from '../game/constants';

interface SectorPayload {
  x: unknown;
  y: unknown;
}

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

type ValidCoord = { ok: true; x: number; y: number };
type InvalidCoord = { ok: false; code: string; message: string };

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

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);

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
  async handleConnection(client: Socket): Promise<void> {
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
  private async maybeReenterShipEntry(
    client: Socket,
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
  private joinPlayerRooms(client: Socket, userid: string, sector: { x: number; y: number }): void {
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
  private async noticeShipLossOnEntry(client: Socket, userid: string): Promise<void> {
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
    client: Socket,
    userid: string,
    opts: { noticeShipLoss?: boolean } = {},
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

    if (ships.length === 1) {
      // Exactly one ship — auto-board it (original single-ship returning-player path).
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
    client: Socket,
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
        const userRow = await this.prisma.user.findUnique({ where: { userid }, select: { teamcode: true, options: true, kills: true } });
        if (userRow?.teamcode != null) state.teamcode = userRow.teamcode;
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

    client.emit('command:result', {
      lines: [{ text: `Welcome aboard, ${activeShip.shipname}.`, category: 'system' }],
    });
    client.emit('player.snapshot', { players: this.registry.list(), selfShipId: shipId });

    const sectorX = Math.floor(activeShip.xcoord);
    const sectorY = Math.floor(activeShip.ycoord);
    this.joinPlayerRooms(client, userid, { x: sectorX, y: sectorY });

    const connectedPlayer: ConnectedPlayer = {
      shipId,
      name: activeShip.shipname,
      sector: { x: sectorX, y: sectorY },
      shipClass: activeShip.shpclass,
    };
    // broadcast (not server.emit) — connecting client already has themselves via snapshot
    client.broadcast.emit('player.joined', connectedPlayer);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.logger.log(`disconnect ${client.id}`);
    const userid = client.data.userid as string | undefined;
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
    @ConnectedSocket() client: Socket,
    @MessageBody() body: CommandPayload,
  ): void {
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
      const resultOrPromise = this.commandRouter.dispatch(input, ship, { client });
      if (resultOrPromise instanceof Promise) {
        resultOrPromise
          .then((result) => {
            this.emitCommandResult(client, result);
            this.processBroadcasts(result, client);
            void this.maybeReenterShipEntry(client, result);
          })
          .catch((err: unknown) => {
            this.logger.error('Async command handler threw:', err);
            client.emit('command:result', {
              lines: [{ text: 'Internal error processing command.', category: 'system' }],
            });
          });
      } else {
        this.emitCommandResult(client, resultOrPromise);
        this.processBroadcasts(resultOrPromise, client);
        void this.maybeReenterShipEntry(client, resultOrPromise);
      }
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
    @ConnectedSocket() client: Socket,
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
            { text: `Welcome aboard, ${state.shipname}.`, category: 'system' },
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
        client.emit('player.snapshot', { players: this.registry.list(), selfShipId: shipId });

        const connectedPlayer: ConnectedPlayer = {
          shipId,
          name: state.shipname,
          sector: { x: Math.floor(state.xcoord), y: Math.floor(state.ycoord) },
          shipClass: state.shpclass,
        };
        // broadcast — connecting client already has themselves via snapshot
        client.broadcast.emit('player.joined', connectedPlayer);

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
                lines: [{ text: `Welcome aboard, ${ship.shipname}.`, category: 'system' }],
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
    client: Socket,
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

  @SubscribeMessage('sector:join')
  handleSectorJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SectorPayload,
  ): void {
    if (!client.data.userid || !this.registry.isBound(client.id)) {
      client.emit('command:result', {
        lines: [{ text: 'Not authenticated or not in play.', category: 'system' }],
      });
      return;
    }
    const result = this.validateCoord(payload, 'sector:join');
    if (!result.ok) {
      client.emit('error', {
        event: 'sector:join',
        code: result.code,
        message: result.message,
      } satisfies GatewayError);
      return;
    }
    const { x, y } = result;
    const room = `sector:${x}:${y}`;
    void client.join(room);
    client.emit('sector:joined', { x, y, room });
  }

  @SubscribeMessage('sector:leave')
  handleSectorLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SectorPayload,
  ): void {
    if (!client.data.userid || !this.registry.isBound(client.id)) {
      client.emit('command:result', {
        lines: [{ text: 'Not authenticated or not in play.', category: 'system' }],
      });
      return;
    }
    const result = this.validateCoord(payload, 'sector:leave');
    if (!result.ok) {
      client.emit('error', {
        event: 'sector:leave',
        code: result.code,
        message: result.message,
      } satisfies GatewayError);
      return;
    }
    const { x, y } = result;
    const room = `sector:${x}:${y}`;
    void client.leave(room);
    client.emit('sector:left', { x, y, room });
  }

  /**
   * The ship name behind a `userid:shipno` key, or undefined if it has left.
   *
   * Guarded: this only decorates a combat notice, and a thrown lookup inside
   * an @OnEvent handler would drop the broadcast for everyone in the sector.
   * A missing name costs a nicer label; a thrown one costs the whole event.
   */
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
  @OnEvent(COMBAT_PHASER_FIRED)
  handleCombatPhaserFired(event: CombatPhaserFiredEvent): void {
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(COMBAT_PHASER_FIRED, event);
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
    this.server.to(`user:${useridOf(event.victimId)}`).emit('event.log', {
      category: 'combat',
      text: deflected
        ? formatMessage(MessageId.PHITDEF, attackerLabel, Math.round(event.damageShield ?? 0))
        : formatMessage(MessageId.PHITYOU, attackerLabel, damstr(event.damageHull ?? 0)),
    });

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
  @OnEvent(SHIP_OVERSPEED)
  handleShipOverspeed(event: ShipOverspeedEvent): void {
    this.server.to(`user:${useridOf(event.shipId)}`).emit('event.log', {
      category: 'combat',
      text: event.kind === 'break' ? `** ${event.text} **` : event.text,
    });
  }

  @OnEvent(COMBAT_SHIP_DESTROYED)
  handleCombatShipDestroyed(event: CombatShipDestroyedEvent): void {
    const keyParts = event.victimShipKey.split(':');
    const victimShipno = Number(keyParts[keyParts.length - 1]);
    // Read before the hull leaves memory a few lines below — the KILLEDBY
    // announcement at the end of this handler needs it for an AI victim.
    const victimShipName = this.shipNameOf(event.victimShipKey) ?? null;
    if (!isNaN(victimShipno)) {
      this.scanHandler.clearScantab(event.victimUserid, victimShipno);
    }

    // A destroyed player ship has its hull row deleted and noships decremented.
    // Without this line that happens in complete silence, which made two ships
    // lost during playtesting impossible to tell apart from a bug.
    this.logger.log(
      `ship destroyed: victim=${event.victimShipKey} attacker=${event.attackerShipKey ?? 'none'}`,
    );

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
    if (!isNaN(victimShipno)) {
      const inMemoryStatus = this.shipStateService.get(event.victimUserid, victimShipno)?.status;
      void this.prisma.$transaction(async (tx) => {
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

    // Serialize loot amounts as strings — BigInt is not JSON-serializable.
    const payload = {
      ...event,
      weapon: killedByPlanet ? ('ion' as const) : event.weapon,
      // Name the killer. A planet kill takes the planet's name; a ship kill
      // resolves the attacking ship's, because the client's own player list
      // holds live PLAYERS only — an AI killer is never in it, so a Cybertron
      // kill rendered as a bare id or nothing at all and two playtest pilots
      // died repeatedly with no combat text. The hit path already does this.
      attackerName: killedByPlanet
        ? (ionHit?.name ?? null)
        : (event.attackerName ?? (event.attackerId ? this.shipNameOf(event.attackerId) ?? null : null)),
      loot: event.loot.map(l => ({ itemIndex: l.itemIndex, amount: l.amount.toString() })),
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
        ? event.attackerUserid
        : payload.attackerName;
    if (killerLabel) {
      const victimLabel = isAiUserid(event.victimUserid)
        ? (victimShipName ?? event.victimUserid)
        : event.victimUserid;
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
   * Autopilot arrival. The physics tick disengages `holdcourse` and emits this
   * on the internal bus; nothing forwarded it to a socket, so a pilot who set a
   * course simply stopped being steered — no word that they had arrived, and no
   * reason to cut the engines before flying out the far side.
   */
  @OnEvent('physics.nav-arrived')
  handleNavArrived(event: { userid: string; shipno: number; x: number; y: number }): void {
    this.server.to(`user:${event.userid}`).emit('event.log', {
      category: 'nav',
      text: `Arrived at sector (${event.x}, ${event.y}) — autopilot disengaged, engines answering stop.`,
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
          text: '** Shields collapse as you enter hyperspace. **',
        });
      }
      if (event.cloakDropped) {
        this.server.to(room).emit('event.log', {
          category: 'combat',
          text: '** Your cloak collapses as you enter hyperspace. **',
        });
      }
      this.server.to(room).emit('event.log', {
        category: 'system',
        text: 'Entering hyperspace.',
      });
      return;
    }
    this.server.to(room).emit('event.log', {
      category: 'system',
      text: 'Dropping out of hyperspace.',
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
    const warp = event.speed / 1000;
    const text = event.speed <= 0
      ? formatMessage(MessageId.SPEED0)
      : formatMessage(
        MessageId.SPEEDIS,
        Math.floor(warp),
        String(Math.round((warp - Math.floor(warp)) * 100)).padStart(2, '0'),
      );
    this.server.to(`user:${event.userid}`).emit('event.log', { category: 'system', text });
  }

  /**
   * A warp jump shook the missiles off. Canon prints MISSL2 once, however many
   * were tracking, to the captain's own socket — `outprfge(FILTER, usrn)`.
   * @see GEFUNCS.C:517-520
   */
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

  /** Per-sector self-destruct countdown tick warning. @see GEFUNCS.C:1833-1851 */
  @OnEvent('ship-management.destruct-tick')
  handleDestructTick(event: DestructTickPayload): void {
    this.server.to(event.room).emit('event.log', {
      category: 'system',
      text: event.message,
    });
  }

  /** Sector broadcast when self-destruct expires. @see GEFUNCS.C:1863 */
  @OnEvent('ship-management.destruct-boom')
  handleDestructBoom(event: DestructBoomPayload): void {
    this.server.to(event.room).emit('event.log', {
      category: 'combat',
      text: event.message,
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

    // Not every mover is public. This used to `server.emit` unconditionally,
    // handing every client a live position feed for all 24 Cybertrons and
    // every droid — while `who` deliberately hides AI so a pilot cannot route
    // around them without scanning. @see transition-visibility.ts
    if (shouldBroadcastTransition(movingShip?.status)) {
      this.server.emit('physics.sector-transition', event);
    }

    if (fromSector.x === toSector.x && fromSector.y === toSector.y) return;
    if (!movingShip) return;

    // Move the player's socket to the new sector room so they receive sector-scoped events.
    const socketId = this.registry.getSocketId(shipId);
    if (socketId) {
      const playerSocket = this.server.sockets.sockets.get(socketId);
      if (playerSocket) {
        void playerSocket.leave(`sector:${fromSector.x}:${fromSector.y}`);
        void playerSocket.join(`sector:${toSector.x}:${toSector.y}`);
      }
    }

    // Gate: no notices at high warp (speed >= 21000) — GEFUNCS.C:714
    if (movingShip.speed >= 21000) return;

    const name = movingShip.shipname;

    // C tells the mover they moved, and tells the two sectors about them while
    // EXCLUDING the mover: `outsect(FILTER, &sect, usrn, 0)` (GEFUNCS.C:717,722).
    // Without the exclusion a pilot was told "<their own ship> has entered the
    // sector" on every boundary crossing, because their socket joins the
    // destination room just above; and without MOVE1 nothing told them they had
    // changed sector at all.
    if (socketId) {
      this.server.sockets.sockets.get(socketId)?.emit('event.log', {
        category: 'nav',
        text: `You have moved from sector (${fromSector.x}, ${fromSector.y}) to (${toSector.x}, ${toSector.y}).`,
      });
    }

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
  emitCommandResult(client: Socket, result: import('../game/commands/command.types').CommandResult): void {
    if (result.expectFollowup !== undefined) {
      client.data.pendingFollowup = result.expectFollowup;
    }
    if (result.scanRender) {
      client.emit('command:result', {
        lines: [{ text: result.scanRender.header, category: 'info' }],
      });
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
    sender?: Socket,
  ): void {
    if (!result.broadcasts) return;
    for (const broadcast of result.broadcasts) {
      const excludeId = broadcast.excludeSelf ? sender?.id : undefined;

      if (broadcast.event === 'player.snapshot') {
        this.server.emit('player.snapshot', { players: this.registry.list() });
      } else if (broadcast.freq !== undefined) {
        // Tuned transmission — only ships carrying this frequency on one of
        // their three channels hear it. @see GEMAIN.C:2583 outsect / outwar
        const members =
          broadcast.room === 'galaxy' ? undefined : this.roomMembers(broadcast.room);
        this.emitToSockets(broadcast.event, broadcast.payload, members, excludeId, (ship) =>
          ship.freq.includes(broadcast.freq as number),
        );
      } else if (broadcast.room === 'galaxy') {
        // Galaxy-wide: all connected sockets, no filtering
        this.server.emit(broadcast.event, broadcast.payload);
      } else if (broadcast.room.startsWith('ship:')) {
        // A message addressed to ONE pilot, the way C writes to a single
        // terminal with `outprfge(FILTER, shpnum)`. Used by `sca sh` to tell
        // a ship it has been scanned. @see GECMDS.C:2280
        const [, uid, shipnoRaw] = broadcast.room.split(':');
        const shipno = Number(shipnoRaw);
        this.emitToSockets(
          broadcast.event,
          broadcast.payload,
          undefined,
          excludeId,
          (ship) => ship.userid === uid && ship.shipno === shipno,
        );
      } else if (broadcast.room === 'hail') {
        // Hail: every ship in the game hears it. `outwar` (GEMAIN.C:1518-1540)
        // delivers to every `ingegame` ship and never examines cloak —
        // running silent hides you from scanners, not from your own radio.
        // @see GECMDS.C:1845
        this.emitToSockets(broadcast.event, broadcast.payload, undefined, excludeId, () => true);
      } else {
        this.server.to(broadcast.room).emit(broadcast.event, broadcast.payload);
      }
    }
  }

  /** Socket ids currently in `room`, or an empty set when the room is gone. */
  private roomMembers(room: string): Set<string> {
    return this.server.sockets.adapter.rooms.get(room) ?? new Set<string>();
  }

  /**
   * Emits to every socket whose active ship satisfies `accept`.
   *
   * `members` limits the sweep to one room's socket ids; omit it to consider
   * every connected socket. `excludeId` drops the sender, which C does by
   * passing `usrnum` to outsect/outwar.
   */
  private emitToSockets(
    event: string,
    payload: unknown,
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
      sock.emit(event, payload);
    }
  }

  private validateCoord(payload: SectorPayload, event: string): ValidCoord | InvalidCoord {
    const { x, y } = payload;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isInteger(x) ||
      !Number.isInteger(y)
    ) {
      return {
        ok: false,
        code: 'INVALID_PAYLOAD',
        message: 'x and y must be integers',
      };
    }
    if (x < -UNIVMAX || x > UNIVMAX || y < -UNIVMAX || y > UNIVMAX) {
      return {
        ok: false,
        code: 'OUT_OF_BOUNDS',
        message: `Sector (${x},${y}) is outside galaxy bounds [${-UNIVMAX}..${UNIVMAX}]`,
      };
    }
    return { ok: true, x, y };
  }
}
