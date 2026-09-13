import { Socket } from 'socket.io';
import { AuthService } from '../../../src/auth/auth.service';
import { WsAuthGuard } from '../../../src/auth/ws-auth.guard';
import type { Mocked } from 'vitest';

function makeSocket(token?: string): Mocked<Socket> {
  return {
    handshake: { auth: token ? { token } : {} },
    emit: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as Mocked<Socket>;
}

const mockAuthService = {
  verifyJwt: vi.fn(),
};

describe('WsAuthGuard', () => {
  let guard: WsAuthGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new WsAuthGuard(mockAuthService as unknown as AuthService);
  });

  describe('validate()', () => {
    it('returns the JWT payload when the token is valid', async () => {
      const payload = { sub: 'user1', username: 'Alice' };
      mockAuthService.verifyJwt.mockResolvedValueOnce(payload);
      const client = makeSocket('valid.jwt.token');

      const result = await guard.validate(client);

      expect(result).toEqual({ sub: 'user1', username: 'Alice' });
      expect(client.emit).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('emits AUTH_REQUIRED error and disconnects when no token is present', async () => {
      const client = makeSocket(); // no token

      const result = await guard.validate(client);

      expect(result).toBeNull();
      expect(client.emit).toHaveBeenCalledWith('error', {
        code: 'AUTH_REQUIRED',
        message: 'No token provided.',
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(mockAuthService.verifyJwt).not.toHaveBeenCalled();
    });

    it('emits AUTH_REQUIRED error and disconnects when the token is expired', async () => {
      mockAuthService.verifyJwt.mockRejectedValueOnce(new Error('TokenExpiredError'));
      const client = makeSocket('expired.jwt.token');

      const result = await guard.validate(client);

      expect(result).toBeNull();
      expect(client.emit).toHaveBeenCalledWith('error', {
        code: 'AUTH_REQUIRED',
        message: 'Invalid or expired token.',
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('emits AUTH_REQUIRED error and disconnects when the token has an invalid signature', async () => {
      mockAuthService.verifyJwt.mockRejectedValueOnce(new Error('JsonWebTokenError: invalid signature'));
      const client = makeSocket('tampered.jwt.token');

      const result = await guard.validate(client);

      expect(result).toBeNull();
      expect(client.emit).toHaveBeenCalledWith('error', {
        code: 'AUTH_REQUIRED',
        message: 'Invalid or expired token.',
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });
});
