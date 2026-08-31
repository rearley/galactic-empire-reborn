import { ShipChannelRegistry, NO_CHANNEL, CYBMINE_NONE } from '../../../src/game/ship/ship-channel.registry';

/**
 * Channels are this port's `usrnum` (GEMAIN.H:340). The property that matters is
 * uniqueness: `shipno` is per-user and is 1 for every player's first ship, so
 * anything that identifies a firer by shipno resolves to the wrong ship.
 */
describe('ShipChannelRegistry', () => {
  let reg: ShipChannelRegistry;
  beforeEach(() => { reg = new ShipChannelRegistry(); });

  it('gives two different pilots flying their first ship different channels', () => {
    const a = reg.acquire('alice', 1);
    const b = reg.acquire('bob', 1);
    expect(a).not.toBe(b);
  });

  it('is idempotent — a ship already in the game keeps its channel', () => {
    expect(reg.acquire('alice', 1)).toBe(reg.acquire('alice', 1));
  });

  it('numbers from 1 so 0 keeps meaning "nobody has fired on me"', () => {
    // The Vakory droid tests `lastfired > 0` strictly (GEDROIDS.C:447) and
    // stored hulls default lastfired to 0.
    expect(reg.acquire('alice', 1)).toBe(1);
  });

  it('resolves a channel back to the exact ship that holds it', () => {
    reg.acquire('alice', 1);
    const ch = reg.acquire('bob', 2);
    expect(reg.resolve(ch)).toEqual({ userid: 'bob', shipno: 2 });
  });

  it('resolves userids containing a colon', () => {
    const ch = reg.acquire('weird:name', 3);
    expect(reg.resolve(ch)).toEqual({ userid: 'weird:name', shipno: 3 });
  });

  it('reports NO_CHANNEL for a ship that is not in the game', () => {
    expect(reg.channelOf('nobody', 1)).toBe(NO_CHANNEL);
  });

  it('does not resolve a released channel to its old holder', () => {
    const ch = reg.acquire('alice', 1);
    reg.release('alice', 1);
    expect(reg.resolve(ch)).toBeUndefined();
  });

  it('returns the freed channel from release so callers can scrub references', () => {
    const ch = reg.acquire('alice', 1);
    expect(reg.release('alice', 1)).toBe(ch);
    expect(reg.release('alice', 1)).toBe(NO_CHANNEL);
  });

  it('recycles a released channel to the next ship in', () => {
    const ch = reg.acquire('alice', 1);
    reg.release('alice', 1);
    expect(reg.acquire('bob', 1)).toBe(ch);
  });

  it('never hands the same channel to two ships at once', () => {
    const held = new Set<number>();
    for (let i = 0; i < 50; i++) held.add(reg.acquire(`p${i}`, 1));
    expect(held.size).toBe(50);
    reg.release('p10', 1);
    reg.release('p20', 1);
    const reissued = [reg.acquire('x', 1), reg.acquire('y', 1)];
    expect(new Set(reissued).size).toBe(2);
    expect(reg.size()).toBe(50);
  });

  it('treats a negative channel as unresolvable', () => {
    expect(reg.resolve(NO_CHANNEL)).toBeUndefined();
  });

  it('never issues 255 — C reserves it as the cybmine "claimed nobody" sentinel', () => {
    // GECYBS.C:133, 471, 709. A ship holding 255 would read as unclaimed.
    const reg2 = new ShipChannelRegistry();
    const issued = new Set<number>();
    for (let i = 0; i < 300; i++) issued.add(reg2.acquire(`p${i}`, 1));
    expect(issued.has(CYBMINE_NONE)).toBe(false);
    expect(issued.size).toBe(300);
  });
});
