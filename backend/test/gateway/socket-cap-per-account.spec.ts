import { capSocketsForUser, MAX_SOCKETS_PER_USER } from '../../src/gateway/socket-cap';

/**
 * One account cannot hold sockets open without bound.
 *
 * Every authenticated connection costs two Prisma queries and a slot in the
 * server's socket map, and nothing counted them per account. The MAXPLRS seat
 * cap (`game.gateway.ts:290`) bounds ships IN FLIGHT, not sockets before
 * boarding, so an account that never finishes selecting a ship could open them
 * indefinitely. Found by the 2026-09-09 security review.
 *
 * It EVICTS THE OLDEST rather than refusing the newest, deliberately. Refusing
 * would mean a player whose old tabs had not yet timed out could be locked out
 * of their own account by their own stale sockets — turning a hardening measure
 * into a way to lock someone out. Evicting matches what the game already does
 * for a boarded ship (latest wins, SESSION_REPLACED), so the rule is the same
 * one twice rather than two rules.
 *
 * @see docs/audits/2026-09-09-security-review.md
 */
describe('per-account socket cap', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `sock-${i}`);

  it('lets an ordinary player open several tabs', () => {
    expect(capSocketsForUser(ids(MAX_SOCKETS_PER_USER - 1), 'new')).toEqual([]);
  });

  it('evicts the oldest once the cap is reached, never the newcomer', () => {
    const evicted = capSocketsForUser(ids(MAX_SOCKETS_PER_USER), 'new');

    expect(evicted).toEqual(['sock-0']);
    expect(evicted).not.toContain('new');
  });

  it('sheds enough to fit when an account is already far over', () => {
    // Belt and braces: if the map ever drifted past the cap, one connect
    // should bring it back to the cap rather than shaving a single socket.
    const evicted = capSocketsForUser(ids(MAX_SOCKETS_PER_USER + 3), 'new');

    expect(evicted).toEqual(['sock-0', 'sock-1', 'sock-2', 'sock-3']);
  });

  it('never evicts the socket that just arrived', () => {
    const evicted = capSocketsForUser([...ids(MAX_SOCKETS_PER_USER + 5), 'new'], 'new');

    expect(evicted).not.toContain('new');
  });

  it('does nothing for an account with no other sockets', () => {
    expect(capSocketsForUser([], 'new')).toEqual([]);
  });
});
