import { PresenceService } from '../../src/public/presence.service';

describe('PresenceService', () => {
  let presence: PresenceService;
  beforeEach(() => { presence = new PresenceService(); });

  it('counts an arrival', () => {
    presence.arrive('usr_a');
    expect(presence.count()).toBe(1);
  });

  it('counts a player once across two sockets', () => {
    // A reconnect briefly overlaps the old socket, and a player may have the
    // game open in two tabs. Counting sockets would advertise phantom players.
    presence.arrive('usr_a');
    presence.arrive('usr_a');
    expect(presence.count()).toBe(1);
  });

  it('forgets a player on departure', () => {
    presence.arrive('usr_a');
    presence.depart('usr_a');
    expect(presence.count()).toBe(0);
  });

  it('ignores a departure it never saw', () => {
    // handleDisconnect fires for sockets the guard rejected before they were
    // ever admitted, so this is a normal path, not an error.
    expect(() => presence.depart('usr_ghost')).not.toThrow();
    expect(presence.count()).toBe(0);
  });

  it('keeps players separate', () => {
    presence.arrive('usr_a');
    presence.arrive('usr_b');
    expect(presence.count()).toBe(2);
    presence.depart('usr_a');
    expect(presence.count()).toBe(1);
    expect(presence.has('usr_b')).toBe(true);
  });
});
