import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipChannelRegistry, NO_CHANNEL } from '../../../src/game/ship/ship-channel.registry';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShipState(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'user1',
    shipname: 'USS Test',
    status: 0,
    topspeed: 0,
    ...overrides,
  });
}

/**
 * Channels are the port's `usrnum` — the identity that `lastfired`, torpedo,
 * missile and mine records all point at so a kill can be credited back.
 * ShipStateService owns their lifecycle: assigned on the way into the world,
 * released and scrubbed on the way out.
 *
 * @see GEMAIN.H:340, GEFUNCS.C:1224-1225
 */
describe('ShipStateService — channel lifecycle', () => {
  let service: ShipStateService;

  beforeEach(() => {
    const prisma = {
      ship: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
      shipClass: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const tick = { subscribe: jest.fn().mockReturnValue(() => {}) } as unknown as TickService;
    service = new ShipStateService(prisma, tick, new ShipChannelRegistry());
  });

  it('gives two pilots flying their first ship different channels', () => {
    const a = makeShipState({ userid: 'alice', shipno: 1 });
    const b = makeShipState({ userid: 'bob', shipno: 1 });
    service.loadShip(a);
    service.loadShip(b);

    expect(a.channel).toBeDefined();
    expect(b.channel).toBeDefined();
    expect(a.channel).not.toBe(b.channel);
  });

  it('leaves a ship that never entered the world without a channel', () => {
    expect(makeShipState().channel).toBeUndefined();
  });

  it('keeps the same channel when the ship is loaded again', () => {
    const a = makeShipState({ userid: 'alice', shipno: 1 });
    service.loadShip(a);
    const first = a.channel;
    service.loadIfAbsent(a);
    expect(a.channel).toBe(first);
  });

  it('clears lastfired on ships still pointing at a departing attacker', () => {
    // Otherwise the recycled channel silently transfers the grudge — and the
    // kill credit — to whoever comes in next. C does the same on the way out.
    const attacker = makeShipState({ userid: 'attacker', shipno: 1 });
    const victim = makeShipState({ userid: 'victim', shipno: 1 });
    service.loadShip(attacker);
    service.loadShip(victim);
    victim.lastfired = attacker.channel!;

    service.removeFromGame({ userid: 'attacker', shipno: 1 });

    expect(victim.lastfired).toBe(NO_CHANNEL);
    expect(attacker.channel).toBeUndefined();
  });

  it('does not disturb a lastfired that points at someone else', () => {
    const shooter = makeShipState({ userid: 'shooter', shipno: 1 });
    const leaver = makeShipState({ userid: 'leaver', shipno: 1 });
    const victim = makeShipState({ userid: 'victim', shipno: 1 });
    service.loadShip(shooter);
    service.loadShip(leaver);
    service.loadShip(victim);
    victim.lastfired = shooter.channel!;

    service.removeFromGame({ userid: 'leaver', shipno: 1 });

    expect(victim.lastfired).toBe(shooter.channel);
  });

  it('reuses a departed ship\'s channel without re-pointing old references at the newcomer', () => {
    const first = makeShipState({ userid: 'first', shipno: 1 });
    const victim = makeShipState({ userid: 'victim', shipno: 1 });
    service.loadShip(first);
    service.loadShip(victim);
    victim.lastfired = first.channel!;

    service.removeFromGame({ userid: 'first', shipno: 1 });
    const newcomer = makeShipState({ userid: 'newcomer', shipno: 1 });
    service.loadShip(newcomer);

    // The channel number may well be recycled — what must not happen is the
    // victim still naming it.
    expect(victim.lastfired).toBe(NO_CHANNEL);
    expect(victim.lastfired).not.toBe(newcomer.channel);
  });
});
