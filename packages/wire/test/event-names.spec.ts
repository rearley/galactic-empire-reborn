import { WIRE_EVENTS } from '../src/events';

/**
 * Name-parity guard for the wire contract's event-name strings.
 *
 * The expected strings are written as literals here, not derived from
 * `WIRE_EVENTS` itself — a test that reads its expectation from the thing it
 * is testing asserts nothing. This is the declaration-side check; the
 * load-bearing check against the RUNNING game's own constants lives at
 * `backend/test/unit/wire-event-parity.spec.ts`.
 *
 * Event name strings are FROZEN for this phase — eight of the thirty
 * server-to-client names use a colon, the rest a dot. Do not normalise them
 * here or anywhere else.
 *
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */
describe('WIRE_EVENTS', () => {
  const expectedServerToClient = [
    'event.log',
    'command:result',
    'scan:render',
    'error',
    'auth:logout',
    'prompt:ship-name',
    'prompt:ship-select',
    'player.snapshot',
    'player.joined',
    'player.left',
    'player.sector',
    'fkeys.snapshot',
    'physics.sector-transition',
    'sector:ship-left',
    'sector:ship-entered',
    'combat.phaser-fired',
    'combat.hit',
    'combat.miss',
    'combat.decoy-intercept',
    'combat.mine-detonation',
    'combat.ship-destroyed',
    'cybertron.taunt',
    'cybertron.broke-off',
    'droid.annoy',
    'droid.spawned',
    'droid.killed',
    'beacon',
    'command.notice',
    'message.send',
    'ship.renamed',
    'deploy.notice',
  ] as const;

  const expectedClientToServer = ['command', 'prompt:reply'] as const;

  it('carries all 31 server-to-client event names, verbatim', () => {
    const actual = Object.values(WIRE_EVENTS.SERVER_TO_CLIENT);
    for (const name of expectedServerToClient) {
      expect(actual).toContain(name);
    }
    expect(actual).toHaveLength(expectedServerToClient.length);
  });

  it('carries both client-to-server event names, verbatim', () => {
    const actual = Object.values(WIRE_EVENTS.CLIENT_TO_SERVER);
    for (const name of expectedClientToServer) {
      expect(actual).toContain(name);
    }
    expect(actual).toHaveLength(expectedClientToServer.length);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(WIRE_EVENTS)).toBe(true);
    expect(Object.isFrozen(WIRE_EVENTS.SERVER_TO_CLIENT)).toBe(true);
    expect(Object.isFrozen(WIRE_EVENTS.CLIENT_TO_SERVER)).toBe(true);
  });
});
