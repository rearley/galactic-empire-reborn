/**
 * Guard for the POST /admin/midnight/run endpoint.
 *
 * Returns 503 when MIDNIGHT_ADMIN_TOKEN is not configured.
 * Returns 401 when the Authorization header is missing or the token doesn't match.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @see specs/009-midnight-job/contracts/admin-midnight.md
 */

import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { loadMidnightConfig } from './midnight.config';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly configuredToken: string | undefined;

  constructor() {
    this.configuredToken = loadMidnightConfig().adminToken;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.configuredToken) {
      throw new ServiceUnavailableException({ code: 'ADMIN_TOKEN_NOT_CONFIGURED', message: 'MIDNIGHT_ADMIN_TOKEN is not set' });
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'MISSING_TOKEN', message: 'Authorization header required' });
    }

    const provided = authHeader.slice('Bearer '.length);

    if (!constantTimeEqual(provided, this.configuredToken)) {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token' });
    }

    return true;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
