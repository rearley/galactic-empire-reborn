import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { MAXX, MAXY } from '../game/constants';
import { ShipStateService } from '../game/ship/ship-state.service';
import { CommandRouterService } from '../game/commands/command-router.service';
import { ScanHandlerService } from '../game/commands/handlers/scan.handler';
import {
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  COMBAT_MINE_DETONATION,
  COMBAT_MISS,
  COMBAT_PHASER_FIRED,
  COMBAT_SHIP_DESTROYED,
  CombatDecoyInterceptEvent,
  CombatHitEvent,
  CombatMineDetonationEvent,
  CombatMissEvent,
  CombatPhaserFiredEvent,
  CombatShipDestroyedEvent,
} from '../game/combat/combat-events';
import {
  CYBERTRON_EVENT,
  CybertronTauntPayload,
  CybertronBrokeOffPayload,
} from '../game/cybertron/cybertron-events';
import {
  DroidEvents,
  DroidAnnoyEvent,
} from '../game/droid/droid-events';
import {
  ConnectedShipsRegistry,
  ConnectedPlayer,
} from './connected-ships.registry';
import {
  PHYSICS_SECTOR_TRANSITION_EVENT,
  PhysicsSectorTransitionPayload,
} from '../game/tick/sector-transition.subscriber';
import { shipKey } from '../game/ship/ship-state.types';
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

type OnboardingState =
  | { step: 'AWAITING_CLASS' }
  | { step: 'AWAITING_NAME'; selectedClass: number };

/**
 * Handles Socket.io connections, handshake JWT auth, and command dispatch.
 * @see GECMDS.C:111-225 command table
 * @see specs/003-ship-commands/contracts/websocket-events.md
 * @see specs/011-onboarding/contracts/websocket-events.md
 */
@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly shipStateService: ShipStateService,
    private readonly commandRouter: CommandRouterService,
    private readonly registry: ConnectedShipsRegistry,
    private readonly wsAuthGuard: WsAuthGuard,
    private readonly prisma: PrismaService,
    private readonly onboardingService: OnboardingService,
    private readonly scanHandler: ScanHandlerService,
  ) {}

  /**
   * On connection: validate JWT, resolve ship, emit welcome or onboarding prompt.
   * @see specs/011-onboarding/contracts/websocket-events.md §Connection
   */
  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`connection ${client.id}`);

    // Step 1: Validate JWT
    const payload = await this.wsAuthGuard.validate(client);
    if (!payload) return; // already disconnected by guard

    const userid = payload.sub;
    client.data.userid = userid;
    client.data.username = payload.username;

    // Step 2: Look up existing Ship in DB
    let ship = await this.prisma.ship.findFirst({
      where: { userid },
    });

    if (!ship) {
      // US1: New player — start onboarding flow
      const onboardingState: OnboardingState = { step: 'AWAITING_CLASS' };
      client.data.onboarding = onboardingState;

      const classes = await this.onboardingService.buildClassListPayload();
      client.emit('prompt:class-list', { step: 'CLASS', classes });
      return;
    }

    // US2: Returning player — hydrate and bind
    const shipId = shipKey(userid, ship.shipno);

    // Hydrate into memory if not already loaded
    if (!this.shipStateService.get(userid, ship.shipno)) {
      const { prismaShipToState } = await import('../game/ship/ship-state.mappers');
      const state = prismaShipToState(ship);
      try {
        const userRow = await this.prisma.user.findUnique({ where: { userid }, select: { teamcode: true, options: true } });
        if (userRow?.teamcode != null) state.teamcode = userRow.teamcode;
        state.scanNames = (userRow?.options?.[0] ?? 0) === 1;
        state.scanHome = (userRow?.options?.[1] ?? 0) === 1;
      } catch {
        // Non-fatal: teamcode/scanNames/scanHome will be defaults; re-derived on next full hydration
      }
      this.shipStateService.loadShip(state);
    }

    client.data.activeShipNo = ship.shipno;

    // Join per-user room so handlers can broadcast directly to this captain.
    void client.join(`user:${userid}`);

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
    client.emit('player.snapshot', { players: this.registry.list() });

    const connectedPlayer: ConnectedPlayer = {
      shipId,
      name: activeShip.shipname,
      sector: { x: Math.floor(activeShip.xcoord), y: Math.floor(activeShip.ycoord) },
      shipClass: activeShip.shpclass,
    };
    this.server.emit('player.joined', connectedPlayer);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`disconnect ${client.id}`);
    // Clear scantab so stale letter assignments don't persist across sessions.
    const userid = client.data.userid as string | undefined;
    const activeShipNo = client.data.activeShipNo as number | undefined;
    if (userid !== undefined && activeShipNo !== undefined) {
      this.scanHandler.clearScantab(userid, activeShipNo);
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

    const input = typeof body.input === 'string' ? body.input : '';

    try {
      const resultOrPromise = this.commandRouter.dispatch(input, ship, { client });
      if (resultOrPromise instanceof Promise) {
        resultOrPromise
          .then((result) => {
            client.emit('command:result', result);
            this.processBroadcasts(result);
          })
          .catch((err: unknown) => {
            this.logger.error('Async command handler threw:', err);
            client.emit('command:result', {
              lines: [{ text: 'Internal error processing command.', category: 'system' }],
            });
          });
      } else {
        client.emit('command:result', resultOrPromise);
        this.processBroadcasts(resultOrPromise);
      }
    } catch (err: unknown) {
      this.logger.error('Command handler threw:', err);
      client.emit('command:result', {
        lines: [{ text: 'Internal error processing command.', category: 'system' }],
      });
    }
  }

  /**
   * Handles onboarding prompt replies (class selection + ship name).
   * @see specs/011-onboarding/contracts/websocket-events.md §prompt:reply
   */
  @SubscribeMessage('prompt:reply')
  async handlePromptReply(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: PromptReplyPayload,
  ): Promise<void> {
    const onboarding = client.data.onboarding as OnboardingState | undefined;
    const userid = client.data.userid as string | undefined;

    if (!onboarding || !userid) {
      client.emit('error', { code: 'NOT_IN_ONBOARDING', message: 'Not in onboarding.' } satisfies GatewayError);
      return;
    }

    if (onboarding.step === 'AWAITING_CLASS') {
      const classNumber = typeof body.value === 'number' ? body.value : parseInt(String(body.value), 10);
      if (isNaN(classNumber) || !(await this.onboardingService.validateClassReply(classNumber))) {
        const classes = await this.onboardingService.buildClassListPayload();
        client.emit('prompt:class-list', { step: 'CLASS', classes, error: 'Invalid class selection.' });
        return;
      }
      client.data.onboarding = { step: 'AWAITING_NAME', selectedClass: classNumber } satisfies OnboardingState;
      client.emit('prompt:ship-name', {
        step: 'NAME',
        selectedClass: classNumber,
        rule: '1-19 printable ASCII',
      });
      return;
    }

    if (onboarding.step === 'AWAITING_NAME') {
      const name = typeof body.value === 'string' ? body.value.trim() : '';
      if (!this.onboardingService.validateNameReply(name)) {
        client.emit('prompt:ship-name', {
          step: 'NAME',
          selectedClass: onboarding.selectedClass,
          rule: '1-19 printable ASCII',
          error: 'invalid-format',
        });
        return;
      }

      try {
        const state = await this.onboardingService.finalize(userid, onboarding.selectedClass, name);
        const shipId = shipKey(userid, state.shipno);

        const priorSocketId = this.registry.upsert(shipId, client.id);
        if (priorSocketId) {
          this.server.emit('player.left', { shipId });
          this.server.sockets.sockets.get(priorSocketId)?.disconnect(true);
        }

        client.data.activeShipNo = state.shipno;
        client.data.onboarding = undefined;

        client.emit('command:result', {
          lines: [{ text: `Welcome aboard, ${state.shipname}.`, category: 'system' }],
        });
        client.emit('player.snapshot', { players: this.registry.list() });

        const connectedPlayer: ConnectedPlayer = {
          shipId,
          name: state.shipname,
          sector: { x: Math.floor(state.xcoord), y: Math.floor(state.ycoord) },
          shipClass: state.shpclass,
        };
        this.server.emit('player.joined', connectedPlayer);

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
              client.emit('command:result', {
                lines: [{ text: `Welcome aboard, ${ship.shipname}.`, category: 'system' }],
              });
            }
            return;
          }
          // Name collision
          client.emit('prompt:ship-name', {
            step: 'NAME',
            selectedClass: onboarding.selectedClass,
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

  /** @see specs/006b-combat/contracts/combat-events.md */
  @OnEvent(COMBAT_PHASER_FIRED)
  handleCombatPhaserFired(event: CombatPhaserFiredEvent): void {
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(COMBAT_PHASER_FIRED, event);
  }

  @OnEvent(COMBAT_HIT)
  handleCombatHit(event: CombatHitEvent): void {
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(COMBAT_HIT, event);
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
   * Ship destruction is broadcast galaxy-wide.
   * Also clears the victim's scantab so stale assignments don't persist on respawn.
   * @see specs/006b-combat/contracts/combat-events.md
   */
  @OnEvent(COMBAT_SHIP_DESTROYED)
  handleCombatShipDestroyed(event: CombatShipDestroyedEvent): void {
    // Parse shipno from victimShipKey ("userid:shipno") using the last segment.
    const keyParts = event.victimShipKey.split(':');
    const victimShipno = Number(keyParts[keyParts.length - 1]);
    if (!isNaN(victimShipno)) {
      this.scanHandler.clearScantab(event.victimUserid, victimShipno);
    }
    this.server.emit(COMBAT_SHIP_DESTROYED, event);
  }

  /** Planet-attack owner alert — emitted from PlanetAttackService.callForHelp. @see GECMDS.C:3952 call_4_help */
  @OnEvent(ATTACK_OWNER_ALERT_EVENT)
  handleAttackOwnerAlert(event: AttackOwnerAlertPayload): void {
    this.server.to(`user:${event.ownerUserid}`).emit('event.log', {
      category: 'system',
      text: event.message,
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
    const room = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(room).emit(CYBERTRON_EVENT.TAUNT, event);
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
    const room = `sector:${sector.x}:${sector.y}`;
    this.server.to(room).emit(CYBERTRON_EVENT.BROKE_OFF, event);
  }

  /** @see specs/010-react-frontend/data-model.md §C.2 */
  @OnEvent(PHYSICS_SECTOR_TRANSITION_EVENT)
  handleSectorTransition(event: PhysicsSectorTransitionPayload): void {
    this.server.emit('physics.sector-transition', event);
  }

  /**
   * @see GEDROIDS.C:237 droid_annoy
   */
  @OnEvent(DroidEvents.ANNOY)
  handleDroidAnnoy(event: DroidAnnoyEvent): void {
    const targetRoom = `to:${event.toUserid}:${event.toShipno}`;
    const sectorRoom = `sector:${event.sector.x}:${event.sector.y}`;
    this.server.to(targetRoom).to(sectorRoom).emit(DroidEvents.ANNOY, event);
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
  private processBroadcasts(result: import('../game/commands/command.types').CommandResult): void {
    if (!result.broadcasts) return;
    for (const broadcast of result.broadcasts) {
      if (broadcast.event === 'player.snapshot') {
        this.server.emit('player.snapshot', { players: this.registry.list() });
      } else if (broadcast.room === 'galaxy') {
        // Galaxy-wide: all connected sockets, no filtering
        this.server.emit(broadcast.event, broadcast.payload);
      } else if (broadcast.room === 'hail') {
        // Hail: all connected sockets, exclude cloaked recipients
        for (const [socketId] of this.server.sockets.sockets) {
          const sock = this.server.sockets.sockets.get(socketId);
          if (!sock) continue;
          const uid = sock.data.userid as string | undefined;
          const shipno = sock.data.activeShipNo as number | undefined;
          if (uid == null || shipno == null) continue;
          const ship = this.shipStateService.get(uid, shipno);
          if (ship?.cloak) continue;
          sock.emit(broadcast.event, broadcast.payload);
        }
      } else {
        this.server.to(broadcast.room).emit(broadcast.event, broadcast.payload);
      }
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
    if (x < 1 || x > MAXX || y < 1 || y > MAXY) {
      return {
        ok: false,
        code: 'OUT_OF_BOUNDS',
        message: `Sector (${x},${y}) is outside galaxy bounds [1..${MAXX}, 1..${MAXY}]`,
      };
    }
    return { ok: true, x, y };
  }
}
