import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MAXX, MAXY } from '../game/constants';

interface SectorPayload {
  x: unknown;
  y: unknown;
}

interface GatewayError {
  event: string;
  code: string;
  message: string;
}

type ValidCoord = { ok: true; x: number; y: number };
type InvalidCoord = { ok: false; code: string; message: string };

/**
 * Handles Socket.io connections and sector room membership.
 * Bounds: X ∈ [1,30], Y ∈ [1,15] from MAXX/MAXY.
 * @see GEMAIN.H MAXX, MAXY
 */
@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    console.log(`[Nest] LOG [GameGateway]     connection ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    console.log(`[Nest] LOG [GameGateway]     disconnect ${client.id}`);
  }

  @SubscribeMessage('sector:join')
  handleSectorJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SectorPayload,
  ): void {
    const result = this.validateCoord(payload, 'sector:join');
    if (!result.ok) {
      client.emit('error', { event: 'sector:join', code: result.code, message: result.message } satisfies GatewayError);
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
      client.emit('error', { event: 'sector:leave', code: result.code, message: result.message } satisfies GatewayError);
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
      return { ok: false, code: 'INVALID_PAYLOAD', message: 'x and y must be integers' };
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
