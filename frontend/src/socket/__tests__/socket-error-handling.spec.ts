import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleServerError, socket } from '../socketClient';
import { setToken, getToken } from '../../auth/tokenStore';

/**
 * A displaced session is not a bad credential.
 *
 * `SESSION_REPLACED` is sent to the OLDER socket when a newer one takes the
 * seat — latest-wins. The client treated it like `AUTH_REQUIRED` and wiped the
 * JWT from localStorage, which is shared across the tab: a backend hot reload or
 * any moment where two sockets overlap logged the player out to the login
 * screen mid-game, and it looked like whatever command they had just typed had
 * done it.
 */
describe('socket error handling', () => {
  beforeEach(() => {
    localStorage.clear();
    setToken('jwt-abc');
    vi.spyOn(socket, 'disconnect').mockReturnValue(socket);
  });

  it('keeps the token when another session takes the seat', () => {
    handleServerError({ code: 'SESSION_REPLACED' });
    expect(getToken()).toBe('jwt-abc');
  });

  it('stops reconnecting when another session takes the seat', () => {
    handleServerError({ code: 'SESSION_REPLACED' });
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('clears the token when the server rejects the credential itself', () => {
    handleServerError({ code: 'AUTH_REQUIRED' });
    expect(getToken()).toBeNull();
  });

  it('ignores unrelated error codes', () => {
    handleServerError({ code: 'NO_SHIP' });
    expect(getToken()).toBe('jwt-abc');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
