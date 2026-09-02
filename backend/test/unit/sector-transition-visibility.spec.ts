import { shouldBroadcastTransition } from '../../src/gateway/transition-visibility';
import { GESTAT_USER, GESTAT_AUTO } from '../../src/game/constants';

/**
 * `physics.sector-transition` was emitted with `server.emit` — to every
 * connected client, for every ship, including all 24 Cybertrons and every
 * droid. A pilot's client therefore received a live feed of exactly where each
 * AI was, without scanning for it.
 *
 * That contradicts the port's own rule elsewhere: `who` deliberately omits AI
 * because "listing every live ship printed all 24 Cybertrons with their exact
 * sectors, so a pilot could route around them" (who.handler.ts). The scan
 * commands are the intended way to learn where an AI is.
 *
 * Player transitions stay galaxy-wide: `who` already publishes every player's
 * sector, so that is not a leak, and the client's player panel is driven by it.
 */
describe('shouldBroadcastTransition', () => {
  it('publishes a player moving between sectors', () => {
    expect(shouldBroadcastTransition(GESTAT_USER)).toBe(true);
  });

  it('does NOT publish an AI ship\'s movement', () => {
    expect(shouldBroadcastTransition(GESTAT_AUTO)).toBe(false);
  });

  it('stays silent when the ship cannot be identified', () => {
    // A ship already evicted from the map: better to say nothing than to leak.
    expect(shouldBroadcastTransition(undefined)).toBe(false);
  });
});
