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
import { Server, Socket } from 'socket.io';
import { MAXX, MAXY } from '../game/constants';
import { ShipStateService } from '../game/ship/ship-state.service';
import { CommandRouterService } from '../game/commands/command-router.service';

interface SectorPayload {
  x: unknown;
  y: unknown;
}

interface CommandPayload {
  input: unknown;
}

interface GatewayError {
  event?: string;
  code: string;
  message: string;
}

type ValidCoord = { ok: true; x: number; y: number };
type InvalidCoord = { ok: false; code: string; message: string };

/**
 * Handles Socket.io connections, handshake ship resolution, and command dispatch.
 * @see GECMDS.C:111-225 command table
 * @see specs/003-ship-commands/contracts/websocket-events.md
 */
@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly shipStateService: ShipStateService,
    private readonly commandRouter: CommandRouterService,
  ) {}

  /**
   * On connection: validate userid, resolve active ship, emit welcome.
   * @see specs/003-ship-commands/contracts/websocket-events.md §Connection
   * @see FR-030 — active ship resolved on handshake, not via in-game command
   */
  handleConnection(client: Socket): void {
    this.logger.log(`connection ${client.id}`);

    const rawUserid = client.handshake.query['userid'];
    if (typeof rawUserid !== 'string' || !rawUserid) {
      client.emit('error', {
        code: 'NO_USER',
        message: 'No userid in handshake.',
      } satisfies GatewayError);
      client.disconnect(true);
      return;
    }

    const userid = rawUserid;
    client.data.userid = userid;

    const ships = this.shipStateService.findByUserid(userid);

    if (ships.length === 0) {
      client.emit('error', {
        code: 'NO_SHIP',
        message: 'No ship found for user.',
      } satisfies GatewayError);
      client.disconnect(true);
      return;
    }

    // Pick lowest shipno (deterministic; no BOARD command in original GECMDS.C table)
    const activeShip = ships[0];
    client.data.activeShipNo = activeShip.shipno;

    if (ships.length >= 2) {
      // Log exactly this string — handshake-resolution.spec.ts asserts it verbatim
      this.logger.warn(
        `[ShipStateService] WARN multiple ships for userid=${userid}, picked lowest shipno=${activeShip.shipno}`,
      );
    }

    client.emit('command:result', {
      lines: [
        {
          text: `Welcome aboard, ${activeShip.shipname}.`,
          category: 'system',
        },
      ],
    });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`disconnect ${client.id}`);
  }

  /**
   * Handles player text commands routed through CommandRouterService.
   * @see GECMDS.C dispatch loop
   * @see specs/003-ship-commands/contracts/websocket-events.md §command
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
      const result = this.commandRouter.dispatch(input, ship, { client });
      client.emit('command:result', result);
    } catch (err: unknown) {
      this.logger.error('Command handler threw:', err);
      client.emit('command:result', {
        lines: [{ text: 'Internal error processing command.', category: 'system' }],
      });
    }
  }

  @SubscribeMessage('sector:join')
  handleSectorJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SectorPayload,
  ): void {
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
