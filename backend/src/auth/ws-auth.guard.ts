import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { AuthService } from './auth.service';

export interface WsJwtPayload {
  sub: string;
  username: string;
}

/**
 * WebSocket authentication guard for Socket.io connections.
 *
 * Intentionally NOT a NestJS CanActivate guard — NestJS guards do not
 * integrate cleanly with Socket.io lifecycle hooks (handleConnection).
 * Instead, the gateway calls {@link WsAuthGuard.validate} directly inside
 * handleConnection and bails out early if null is returned.
 */
@Injectable()
export class WsAuthGuard {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Validates the JWT from socket.handshake.auth.token.
   * Returns the decoded payload on success.
   * On failure: emits error and disconnects the socket, then returns null.
   */
  async validate(client: Socket): Promise<WsJwtPayload | null> {
    const token = client.handshake.auth['token'] as string | undefined;
    if (!token) {
      client.emit('error', { code: 'AUTH_REQUIRED', message: 'No token provided.' });
      client.disconnect(true);
      return null;
    }
    try {
      const payload = await this.authService.verifyJwt(token);

      // Two-step registration means a valid token can belong to an account that
      // has credentials but no display handle yet. Canon's username()
      // (GEFUNCS.C:2596) names a player throughout combat and sector messaging,
      // so a null must never reach the game — this is the gate that makes the
      // nullable column safe.
      if (!payload.username) {
        this.logger.warn(`WsAuthGuard: ${payload.sub} has no username — refusing`);
        client.emit('error', {
          code: 'USERNAME_REQUIRED',
          message: 'Finish signing up by choosing a username.',
        });
        client.disconnect(true);
        return null;
      }

      return { sub: payload.sub, username: payload.username };
    } catch (err: unknown) {
      this.logger.warn(`WsAuthGuard: invalid token — ${String(err)}`);
      client.emit('error', { code: 'AUTH_REQUIRED', message: 'Invalid or expired token.' });
      client.disconnect(true);
      return null;
    }
  }
}
