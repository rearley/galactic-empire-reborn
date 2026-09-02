/**
 * T035 — US6: Droid kill scoring regression test.
 *
 * Killing a Droid awards the Droid's class points to the player's score/klscore.
 * No deduction on the Droid side. No exception when the Droid victim has no User row.
 *
 * @see specs/009-midnight-job/tasks.md T035
 * @see specs/009-midnight-job/plan.md — FR-025/026
 */

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';
import { PlayerScoreService } from '../../../src/game/player/player-score.service';
import { PlayerScoreRepository } from '../../../src/game/player/player-score.repository';
import { CHGLOSER_DEFAULT } from '../../../src/game/midnight/midnight.constants';

function makeEvent(overrides: Partial<CombatShipDestroyedEvent> = {}): CombatShipDestroyedEvent {
  return {
    victimId: '@Droid-1:1',
    attackerId: 'attacker:1',
    victimShipKey: '@Droid-1:1',
    attackerShipKey: 'attacker:1',
    victimUserid: '@Droid-1',
    attackerUserid: 'attacker',
    attackerChannel: 1,
    weapon: 'phaser',
    sector: { x: 5, y: 5 },
    tickAt: new Date(),
    loot: [],
    scoreAwarded: 0,
    ...overrides,
  };
}

// Droid class → points mapping (from reference/wiki/cpu-ships.md)
const DROID_CLASS_POINTS: Record<number, number> = {
  31: 75,   // Lydorian Garbage Scow (class 10 / classNumber 31)
  32: 5000, // Murdonian Transport (class 11 / classNumber 32)
  33: 100,  // Vakory Survey Drone (class 12 / classNumber 33)
};

describe('US6 — Droid kill scoring (FR-025/026)', () => {
  let events: EventEmitter2;
  let transferKillScore: jest.Mock;
  let applyCashPenalty: jest.Mock;
  let service: PlayerScoreService;

  beforeEach(() => {
    events = new EventEmitter2();
    transferKillScore = jest.fn().mockResolvedValue(undefined);
    applyCashPenalty = jest.fn().mockResolvedValue(0n);
    const repo = { transferKillScore, applyCashPenalty, getRospos: jest.fn().mockResolvedValue(0) } as unknown as PlayerScoreRepository;
    service = new PlayerScoreService(events, repo, CHGLOSER_DEFAULT);
    service.onModuleInit();
  });

  it.each(Object.entries(DROID_CLASS_POINTS))(
    'Droid class %s: awards %s points to attacker via isAiVictim=true path',
    async (_classNum, points) => {
      events.emit(COMBAT_SHIP_DESTROYED, makeEvent({
        victimUserid: '@Droid-1',
        attackerUserid: 'attacker',
        scoreAwarded: points,
      }));
      await new Promise((r) => setImmediate(r));

      expect(transferKillScore).toHaveBeenCalledWith('attacker', '@Droid-1', points, true, false);
    },
  );

  it('no exception when Droid victim has no User row (FR-026)', async () => {
    // transferKillScore with isAiVictim=true already skips victim deduction
    // This test verifies no crash occurs
    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({
      victimUserid: '@Droid-3',
      scoreAwarded: DROID_CLASS_POINTS[33],
    }));
    await new Promise((r) => setImmediate(r));

    expect(transferKillScore).toHaveBeenCalledWith('attacker', '@Droid-3', DROID_CLASS_POINTS[33], true, false);
    expect(applyCashPenalty).not.toHaveBeenCalled();
  });

  it('does NOT call applyCashPenalty when victim is a Droid (AI side short-circuit)', async () => {
    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({
      victimUserid: '@Droid-2',
      attackerUserid: 'player1',
      scoreAwarded: DROID_CLASS_POINTS[32],
    }));
    await new Promise((r) => setImmediate(r));

    expect(applyCashPenalty).not.toHaveBeenCalled();
  });
});
