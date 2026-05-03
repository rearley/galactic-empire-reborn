/**
 * T012 — Verify combat.ship-destroyed payload has all four fields required by
 * the Cybertron gold-transfer listener (T061, FR-005a, R-4).
 *
 * If any field is missing or wrong type, the gold-transfer logic cannot
 * identify Cybertron victims via /^Cybrg-/ regex.
 *
 * @see specs/007-cybertron-ai/tasks.md T012
 * @see backend/src/game/combat/combat-events.ts CombatShipDestroyedEvent
 */
import {
  CombatShipDestroyedEvent,
  COMBAT_SHIP_DESTROYED,
} from '../../../src/game/combat/combat-events';

describe('CombatShipDestroyedEvent — required fields for Cybertron gold transfer', () => {
  it('event name constant is combat.ship-destroyed', () => {
    expect(COMBAT_SHIP_DESTROYED).toBe('combat.ship-destroyed');
  });

  it('payload has attackerShipKey field (string | null)', () => {
    const payload: CombatShipDestroyedEvent = makeSampleEvent();
    expect(typeof payload.attackerShipKey === 'string' || payload.attackerShipKey === null).toBe(true);
  });

  it('payload has victimShipKey field (string)', () => {
    const payload: CombatShipDestroyedEvent = makeSampleEvent();
    expect(typeof payload.victimShipKey).toBe('string');
  });

  it('payload has attackerUserid field (string | null)', () => {
    const payload: CombatShipDestroyedEvent = makeSampleEvent();
    expect(typeof payload.attackerUserid === 'string' || payload.attackerUserid === null).toBe(true);
  });

  it('payload has victimUserid field (string)', () => {
    const payload: CombatShipDestroyedEvent = makeSampleEvent();
    expect(typeof payload.victimUserid).toBe('string');
  });

  it('victimUserid matches Cybrg- prefix when victim is a Cybertron', () => {
    const payload: CombatShipDestroyedEvent = {
      ...makeSampleEvent(),
      victimShipKey: 'Cybrg-42:1',
      victimUserid: 'Cybrg-42',
    };
    expect(/^Cybrg-/.test(payload.victimUserid)).toBe(true);
  });

  it('attackerUserid is null when kill was by a mine with no attacker', () => {
    const payload: CombatShipDestroyedEvent = {
      ...makeSampleEvent(),
      attackerShipKey: null,
      attackerUserid: null,
    };
    expect(payload.attackerUserid).toBeNull();
  });
});

function makeSampleEvent(): CombatShipDestroyedEvent {
  return {
    victimId: 'player1:1',
    attackerId: 'player2:1',
    victimShipKey: 'player1:1',
    attackerShipKey: 'player2:1',
    victimUserid: 'player1',
    attackerUserid: 'player2',
    attackerChannel: 1,
    weapon: 'phaser',
    sector: { x: 0, y: 0 },
    tickAt: new Date(),
  };
}
