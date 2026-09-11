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
import { GESTAT_AUTO, GESTAT_USER, MAXPLRS } from '../game/constants';
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
import { scopePlayers } from './player-visibility';
import { planTransition, RoomEmit } from './sector-transition';
import { capSocketsForUser, MAX_SOCKETS_PER_USER } from './socket-cap';
import { SHIP_OVERSPEED, ShipOverspeedEvent } from '../game/ship/overspeed-events';
import { PLANET_BEACON, PlanetBeaconEvent } from '../game/ship/beacon-events';
import { BEACON_EVENT } from './events/beacon.event';
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
import { damstr } from '../game/combat/combat-math';
import { attackerNameFromLastFired, resolveKillSpoils } from '../game/combat/kill-resolution';
import { isAiUserid } from '../game/commands/helpers/ai-userid';
import { MESG_SHIPLOSS } from '../game/player/ship-loss-mail.service';
import { DOC_PLANET_LIMIT, MAIL_CLASS_DISTRESS, RNDDOC } from '../game/constants';
import type { CommandBroadcast } from '../game/commands/command.types';
import { dispatchBroadcast, emitToSockets, roomMembers } from './broadcast-dispatch';
import { DestroyedEmitter, ShipDestroyedService } from './ship-destroyed.service';
import { ConnectionLifecycleService, LifecycleHost } from './connection-lifecycle.service';
import { shipNameOf } from './ship-identity';
import {
  Narration,
  narratePlanetBeacon,
  narrateShipOverspeed,
  narrateAttackOwnerAlert,
  narrateDestructBlast,
  narrateSystemRepaired,
  narratePhaserCharge,
  narrateStatusNotice,
  narrateCombatMineWarning,
  narrateUniverseEdge,
  narrateShieldCharge,
  narrateSpeedReport,
  narrateWarpProgress,
  narrateEngineShutdown,
  narrateMissileShaken,
  narrateGravity,
  narrateDestructCancelled,
  narrateCloakCollapsed,
} from './narration';

interface CommandPayload {
  input: unknown;
}

interface PromptReplyPayload {
  value: unknown;
}

export interface GatewayError {
  event?: string;
  code: string;
  message: string;
}

export type OnboardingState = { step: 'AWAITING_NAME' };

/** Per-entry data stored in client.data while a multi-ship player is choosing a ship. */
export interface PendingShipSelectEntry {
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
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Every shape `processBroadcasts`/`emitToSockets` actually call `.emit()` on:
 * the whole server (galaxy-wide), a room operator (`server.to(room)`), or one
 * connected socket. All three carry the same `ServerToClientEvents` map.
 */
export type BroadcastTarget = GameServer | GameSocket | ReturnType<GameServer['to']>;

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: GameServer;

  private readonly logger = new Logger(GameGateway.name);

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
    private readonly shipDestroyed: ShipDestroyedService,
    private readonly connectionLifecycle: ConnectionLifecycleService,
  ) {}

  /** Emit one narration line to the room it names. */
  private emitNarration({ room, category, text }: Narration): void {
    this.server.to(room).emit('event.log', { category, text });
  }

  /**
   * The seam `ConnectionLifecycleService` speaks through: the live `server`
   * plus this gateway's logger, so every line the lifecycle prints keeps its
   * original context. @see connection-lifecycle.service.ts LifecycleHost
   */
  private lifecycleHost(): LifecycleHost {
    const gateway = this;
    return {
      get server(): GameServer {
        return gateway.server;
      },
      log: (message) => this.logger.log(message),
      error: (message, err) => this.logger.error(message, err),
    };
  }

  /** @see connection-lifecycle.service.ts onConnect */
  async handleConnection(client: GameSocket): Promise<void> {
    await this.connectionLifecycle.onConnect(this.lifecycleHost(), client);
  }

  /** @see connection-lifecycle.service.ts onDisconnect */
  async handleDisconnect(client: GameSocket): Promise<void> {
    await this.connectionLifecycle.onDisconnect(this.lifecycleHost(), client);
  }

  /** @see connection-lifecycle.service.ts maybeExitGame */
  private async maybeExitGame(
    client: GameSocket,
    result: import('../game/commands/command.types').CommandResult,
  ): Promise<void> {
    await this.connectionLifecycle.maybeExitGame(this.lifecycleHost(), client, result);
  }

  /** @see connection-lifecycle.service.ts maybeReenterShipEntry */
  private async maybeReenterShipEntry(
    client: GameSocket,
    result: import('../game/commands/command.types').CommandResult,
  ): Promise<void> {
    await this.connectionLifecycle.maybeReenterShipEntry(this.lifecycleHost(), client, result);
  }

  /** @see connection-lifecycle.service.ts emitScopedSnapshotToAll */
  private emitScopedSnapshotToAll(): void {
    this.connectionLifecycle.emitScopedSnapshotToAll(this.lifecycleHost());
  }

  /** @see connection-lifecycle.service.ts emitScopedSnapshot */
  private emitScopedSnapshot(
    client: Pick<GameSocket, 'emit'>,
    viewer: { x: number; y: number },
    selfShipId?: string,
  ): void {
    this.connectionLifecycle.emitScopedSnapshot(client, viewer, selfShipId);
  }

  /** @see connection-lifecycle.service.ts announceJoin */
  private announceJoin(client: GameSocket, player: ConnectedPlayer, sector: { x: number; y: number }): void {
    this.connectionLifecycle.announceJoin(client, player, sector);
  }

  /** @see connection-lifecycle.service.ts joinPlayerRooms */
  private joinPlayerRooms(client: GameSocket, userid: string, sector: { x: number; y: number }): void {
    this.connectionLifecycle.joinPlayerRooms(client, userid, sector);
  }

  /** @see connection-lifecycle.service.ts presentShipEntry */
  private async presentShipEntry(
    client: GameSocket,
    userid: string,
    opts: { noticeShipLoss?: boolean; autoBoard?: boolean } = {},
  ): Promise<void> {
    await this.connectionLifecycle.presentShipEntry(this.lifecycleHost(), client, userid, opts);
  }

  /** @see connection-lifecycle.service.ts boardShipAndWelcome */
  private async boardShipAndWelcome(
    client: GameSocket,
    userid: string,
    ship: { shipno: number; shipname: string; shpclass: number; xcoord: number; ycoord: number; damage: number; energy: number; heading: number; speed: number; where: number; [key: string]: unknown },
  ): Promise<void> {
    await this.connectionLifecycle.boardShipAndWelcome(this.lifecycleHost(), client, userid, ship);
  }

  /** @see connection-lifecycle.service.ts filteredRooms */
  private filteredRooms(): string[] {
    return this.connectionLifecycle.filteredRooms();
  }

  /** @see connection-lifecycle.service.ts announceArrival */
  private announceArrival(ship: ShipState): void {
    this.connectionLifecycle.announceArrival(this.lifecycleHost(), ship);
  }

  /** @see connection-lifecycle.service.ts announceDeparture */
  private announceDeparture(ship: ShipState): void {
    this.connectionLifecycle.announceDeparture(this.lifecycleHost(), ship);
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
      shipName: shipNameOf(this.shipStateService, event.shipId),
    };
    this.server.to(`user:${useridOf(event.shipId)}`).emit(COMBAT_PHASER_FIRED, enriched);
  }

  @OnEvent(COMBAT_HIT)
  handleCombatHit(event: CombatHitEvent): void {
    // Name the attacking SHIP, not its userid — `sca sh` takes the ship name,
    // and AI ships are absent from the roster the client resolves names from.
    const enriched: CombatHitEvent = {
      ...event,
      attackerName: shipNameOf(this.shipStateService, event.attackerId),
      victimName: shipNameOf(this.shipStateService, event.victimId),
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

  @OnEvent(PLANET_BEACON)
  handlePlanetBeacon(event: PlanetBeaconEvent): void {
    this.emitNarration(narratePlanetBeacon(event));
  }

  @OnEvent(SHIP_OVERSPEED)
  handleShipOverspeed(event: ShipOverspeedEvent): void {
    this.emitNarration(narrateShipOverspeed(event));
  }

  /**
   * A one-line delegate. The body moved to `ShipDestroyedService` with the kill
   * it belongs to; this entry point stays because `captured-document.spec.ts`
   * drives it directly, and that spec does not change.
   */
  private revealCapturedDocument(victimUserid: string, killerUserid: string): Promise<void> {
    return this.shipDestroyed.revealCapturedDocument(victimUserid, killerUserid, this.destroyedEmitter());
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
    return this.shipDestroyed.handle(event, this.destroyedEmitter());
  }

  /**
   * The seam `ShipDestroyedService` speaks through: everything the death path
   * still needs of the transport layer, resolved against the live `server`.
   * @see ship-destroyed.service.ts DestroyedEmitter
   */
  private destroyedEmitter(): DestroyedEmitter {
    return {
      toRoom: (room, category, text) => this.server.to(room).emit('event.log', { category, text }),
      toAllExcept: (rooms, category, text) =>
        this.server.except(rooms).emit('event.log', { category, text }),
      announceDestroyed: (payload) => this.server.emit(COMBAT_SHIP_DESTROYED, payload),
      takeIonAttacker: (victimId) => {
        const hit = this.lastIonAttacker.get(victimId) ?? null;
        this.lastIonAttacker.delete(victimId);
        return hit;
      },
      recoverVictim: (userid) => this.recoverAfterDeath(userid),
      warn: (message) => this.logger.warn(message),
      error: (message, err) => this.logger.error(message, err),
    };
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

  @OnEvent(ATTACK_OWNER_ALERT_EVENT)
  handleAttackOwnerAlert(event: AttackOwnerAlertPayload): void {
    this.emitNarration(narrateAttackOwnerAlert(event));
  }

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

  @OnEvent(COMBAT_DESTRUCT_BLAST)
  handleDestructBlast(event: CombatDestructBlastEvent): void {
    this.emitNarration(narrateDestructBlast(event));
  }

  @OnEvent(SHIP_SYSTEM_REPAIRED)
  handleSystemRepaired(event: ShipSystemRepairedEvent): void {
    this.emitNarration(narrateSystemRepaired(event));
  }

  @OnEvent(SHIP_PHASER_CHARGE)
  handlePhaserCharge(event: ShipPhaserChargeEvent): void {
    this.emitNarration(narratePhaserCharge(event));
  }

  @OnEvent(SHIP_STATUS_NOTICE)
  handleStatusNotice(event: ShipStatusNoticeEvent): void {
    this.emitNarration(narrateStatusNotice(event));
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
    this.emitNarration(narrateCombatMineWarning(event));
  }

  @OnEvent(PHYSICS_UNIVERSE_EDGE)
  handlePhysicsUniverseEdge(event: PhysicsUniverseEdgeEvent): void {
    this.emitNarration(narrateUniverseEdge(event));
  }

  @OnEvent(SHIP_SHIELD_CHARGE)
  handleShipShieldCharge(event: ShipShieldChargeEvent): void {
    this.emitNarration(narrateShieldCharge(event));
  }

  @OnEvent(SHIP_SPEED_REPORT)
  handleShipSpeedReport(event: ShipSpeedReportEvent): void {
    this.emitNarration(narrateSpeedReport(event));
  }

  @OnEvent(SHIP_WARP_PROGRESS)
  handleWarpProgress(event: ShipWarpProgressEvent): void {
    this.emitNarration(narrateWarpProgress(event));
  }

  @OnEvent(SHIP_ENGINE_SHUTDOWN)
  handleEngineShutdown(event: ShipEngineShutdownEvent): void {
    this.emitNarration(narrateEngineShutdown(event));
  }

  @OnEvent(SHIP_MISSILE_SHAKEN)
  handleMissileShaken(event: ShipMissileShakenEvent): void {
    this.emitNarration(narrateMissileShaken(event));
  }

  @OnEvent(PHYSICS_GRAVITY)
  handleGravity(event: PhysicsGravityEvent): void {
    this.emitNarration(narrateGravity(event));
  }

  @OnEvent(PHYSICS_DESTRUCT_CANCELLED)
  handleDestructCancelled(event: PhysicsDestructCancelledEvent): void {
    this.emitNarration(narrateDestructCancelled(event));
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

  @OnEvent('ship-management.cloak-collapsed')
  handleCloakCollapsed(event: CloakCollapsedPayload): void {
    this.emitNarration(narrateCloakCollapsed(event));
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
   * Plans the transition with `planTransition` (sector-transition.ts, which
   * carries the full derivation and every `GEFUNCS.C` citation) and executes
   * the plan: emit the pre-move room broadcasts (relying on the mover's
   * current room membership — see `TransitionPlan`), move the mover's socket
   * between rooms, emit to it directly, then emit the post-move room
   * broadcasts.
   *
   * `hasObserver`/`gernd()` for the beacon are computed here, guarded by the
   * same conditions the original inline code guarded them with — including
   * `hasObserver` itself gating the `gernd()` DRAW, not just its result — so
   * a transition that would never have drawn before this was split out still
   * does not draw now. A pure planner must not call `gernd()` itself, but the
   * caller drawing even one extra time would be its own small, silent
   * behaviour change: `gernd()` advances a PRNG stream shared with combat and
   * spawning, so an extra draw shifts every later roll in the game.
   */
  @OnEvent(PHYSICS_SECTOR_TRANSITION)
  handleSectorTransition(event: PhysicsSectorTransitionEvent): void {
    const { shipId, fromSector, toSector } = event;

    const movingShip = this.shipStateService.findAllShips().find((s) => shipKey(s.userid, s.shipno) === shipId);
    const moverSocketId = this.registry.getSocketId(shipId);

    // `gernd()` must be called ONLY when an observer is present — the
    // original guarded the draw itself with `if (!hasObserver) return;`
    // before ever calling `gernd()`. Drawing unconditionally and only
    // gating the RESULT downstream would silently consume an extra roll
    // from the shared PRNG stream on every crossing into an empty sector,
    // shifting every later combat/spawn roll in the game — a real gameplay
    // change, not a refactor.
    let beacon: { hasObserver: boolean; roll: number } | undefined;
    const crossedSector = fromSector.x !== toSector.x || fromSector.y !== toSector.y;
    if (crossedSector && movingShip && movingShip.speed < 21000) {
      const allShips = this.shipStateService.findAllShips();
      const hasObserver = allShips.some(
        (s) =>
          shipKey(s.userid, s.shipno) !== shipId &&
          Math.floor(s.xcoord) === toSector.x &&
          Math.floor(s.ycoord) === toSector.y &&
          (s.status === 1 || s.status === 2),
      );
      if (hasObserver) {
        beacon = { hasObserver, roll: gernd(this.random) };
      }
    }

    const plan = planTransition(
      event,
      this.registry.list(),
      (id) =>
        id === shipId && movingShip
          ? { status: movingShip.status, speed: movingShip.speed, shipname: movingShip.shipname }
          : undefined,
      beacon,
    );

    const moverSocket = moverSocketId ? this.server.sockets.sockets.get(moverSocketId) : undefined;

    for (const emit of plan.moverEmits) {
      switch (emit.event) {
        case 'physics.sector-transition':
          moverSocket?.emit('physics.sector-transition', emit.payload);
          break;
        case 'player.sector':
          moverSocket?.emit('player.sector', emit.payload);
          break;
        case 'event.log':
          moverSocket?.emit('event.log', emit.payload);
          break;
      }
    }

    // A local closure, not a class method: some older tests bind a bare
    // `GameGateway.prototype.handleSectorTransition` reference onto a
    // partial mock object via `.call()`, which would not have a new
    // prototype method available on it (test/integration/beacon.spec.ts).
    const emitRoomBatch = (emits: RoomEmit[]): void => {
      for (const emit of emits) {
        const target = 'exceptSelf' in emit ? this.server.to(emit.room).except(moverSocketId ?? '') : this.server.to(emit.room);
        switch (emit.event) {
          case 'player.sector':
            target.emit('player.sector', emit.payload);
            break;
          case 'sector:ship-left':
            target.emit('sector:ship-left', emit.payload);
            break;
          case 'sector:ship-entered':
            target.emit('sector:ship-entered', emit.payload);
            break;
          case BEACON_EVENT:
            target.emit(BEACON_EVENT, emit.payload);
            break;
        }
      }
    };

    emitRoomBatch(plan.roomEmitsBeforeMove);

    for (const room of plan.leave) void moverSocket?.leave(room);
    for (const room of plan.join) void moverSocket?.join(room);

    emitRoomBatch(plan.roomEmitsAfterMove);
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
          broadcast.room === 'galaxy' ? undefined : roomMembers(this.server, broadcast.room);
        emitToSockets(
          this.server,
          broadcast,
          members,
          excludeId,
          (ship) => ship.freq.includes(broadcast.freq as number),
          (uid, shipno) => this.shipStateService.get(uid, shipno),
        );
      } else if (broadcast.room === 'galaxy') {
        // Galaxy-wide: all connected sockets, no filtering
        dispatchBroadcast(this.server, broadcast);
      } else if (broadcast.room.startsWith('ship:')) {
        // A message addressed to ONE pilot, the way C writes to a single
        // terminal with `outprfge(FILTER, shpnum)`. Used by `sca sh` to tell
        // a ship it has been scanned. @see GECMDS.C:2280
        const [, uid, shipnoRaw] = broadcast.room.split(':');
        const shipno = Number(shipnoRaw);
        emitToSockets(
          this.server,
          broadcast,
          undefined,
          excludeId,
          (ship) => ship.userid === uid && ship.shipno === shipno,
          (userid, shipNo) => this.shipStateService.get(userid, shipNo),
        );
      } else if (broadcast.room === 'hail') {
        // Hail: every ship in the game hears it. `outwar` (GEMAIN.C:1518-1540)
        // delivers to every `ingegame` ship and never examines cloak —
        // running silent hides you from scanners, not from your own radio.
        // @see GECMDS.C:1845
        emitToSockets(
          this.server,
          broadcast,
          undefined,
          excludeId,
          () => true,
          (uid, shipno) => this.shipStateService.get(uid, shipno),
        );
      } else {
        dispatchBroadcast(this.server.to(broadcast.room), broadcast);
      }
    }
  }

}
