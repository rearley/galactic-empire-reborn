import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { AuthService } from '../../src/auth/auth.service';
import { Socket } from 'socket.io';

function makeSocket(token: string | undefined) {
  return {
    handshake: { auth: token === undefined ? {} : { token } },
    emit: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as Socket & { emit: jest.Mock; disconnect: jest.Mock };
}

function makeGuard(payload: unknown) {
  const authService = { verifyJwt: jest.fn().mockResolvedValue(payload) } as unknown as AuthService;
  return new WsAuthGuard(authService);
}

describe('WsAuthGuard', () => {
  it('refuses a token whose account never chose a username', async () => {
    // canon's username() (GEFUNCS.C:2596) names a player throughout combat and
    // sector messaging. A half-registered account reaching the socket would put
    // a null through all of it.
    const guard = makeGuard({ sub: 'usr_half', username: null });
    const client = makeSocket('valid.jwt');

    const result = await guard.validate(client);

    expect(result).toBeNull();
    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'USERNAME_REQUIRED' }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses an empty-string username too', async () => {
    const guard = makeGuard({ sub: 'usr_half', username: '' });
    const client = makeSocket('valid.jwt');
    expect(await guard.validate(client)).toBeNull();
  });

  it('admits a fully registered account', async () => {
    const guard = makeGuard({ sub: 'usr_abc', username: 'rick' });
    const client = makeSocket('valid.jwt');

    expect(await guard.validate(client)).toEqual({ sub: 'usr_abc', username: 'rick' });
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});
