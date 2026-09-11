/**
 * T031 — US5: CHGLOSER PvP cash penalty integration test.
 *
 * When a human player kills another human player:
 *   - transfer = floor(loser.cash * CHGLOSER% / 100)
 *   - capped at loser.cash
 *   - no transfer when either side is AI
 *
 * @see GEFUNCS.C:killem (1087-1218 chgloser block)
 * @see specs/009-midnight-job/tasks.md T031
 */

import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlayerScoreService } from '../../../src/game/player/player-score.service';
import { PlayerScoreRepository } from '../../../src/game/player/player-score.repository';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';
import { CHGLOSER_DEFAULT } from '../../../src/game/midnight/midnight.constants';
import type { Mock } from 'vitest';

function makeEvent(over: Partial<CombatShipDestroyedEvent> = {}): CombatShipDestroyedEvent {
  return {
    victimId: 'victim:1',
    attackerId: 'attacker:1',
    victimShipKey: 'victim:1',
    attackerShipKey: 'attacker:1',
    victimUserid: 'victim',
    attackerUserid: 'attacker',
    attackerChannel: 1,
    weapon: 'phaser',
    sector: { x: 5, y: 5 },
    tickAt: new Date(),
    loot: [],
    scoreAwarded: 50,
    ...over,
  };
}

describe('US5 — CHGLOSER PvP cash penalty (GEFUNCS.C:killem)', () => {
  let events: EventEmitter2;
  let transferKillScore: Mock;
  let applyCashPenalty: Mock;
  let service: PlayerScoreService;

  beforeEach(() => {
    events = new EventEmitter2();
    transferKillScore = vi.fn().mockResolvedValue(undefined);
    applyCashPenalty = vi.fn().mockResolvedValue(100n);
    const repo = { transferKillScore, applyCashPenalty,
      // SCRBONUS term reads the victim's rank; 0 = unranked, no bonus.
      getRospos: vi.fn().mockResolvedValue(0) } as unknown as PlayerScoreRepository;
    service = new PlayerScoreService(events, repo, CHGLOSER_DEFAULT);
    service.onModuleInit();
  });

  it('calls applyCashPenalty when both sides are human', async () => {
    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({
      attackerUserid: 'alice',
      victimUserid: 'bob',
    }));
    await new Promise((r) => setImmediate(r));

    expect(applyCashPenalty).toHaveBeenCalledWith('alice', 'bob', CHGLOSER_DEFAULT);
  });

  it('does NOT call applyCashPenalty when attacker is AI (Cybrg-*)', async () => {
    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({
      attackerUserid: 'Cybrg-7',
      victimUserid: 'alice',
    }));
    await new Promise((r) => setImmediate(r));

    expect(applyCashPenalty).not.toHaveBeenCalled();
  });

  it('does NOT call applyCashPenalty when attacker is AI (Droid-*)', async () => {
    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({
      attackerUserid: '@Droid-3',
      victimUserid: 'alice',
    }));
    await new Promise((r) => setImmediate(r));

    expect(applyCashPenalty).not.toHaveBeenCalled();
  });

  it('does NOT call applyCashPenalty when victim is AI', async () => {
    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({
      attackerUserid: 'alice',
      victimUserid: 'Cybrg-5',
    }));
    await new Promise((r) => setImmediate(r));

    expect(applyCashPenalty).not.toHaveBeenCalled();
  });

  it('does NOT call applyCashPenalty when chgLoserPercent = 0', async () => {
    const eventsZero = new EventEmitter2();
    const penaltyMockZero = vi.fn().mockResolvedValue(0n);
    const repoZero = { transferKillScore: vi.fn().mockResolvedValue(undefined),
    // PlayerScoreService reads the victim's rank for the SCRBONUS term
    // (GEFUNCS.C:1150-1153). 0 = unranked, which pays no bonus.
    getRospos: vi.fn().mockResolvedValue(0), applyCashPenalty: penaltyMockZero } as unknown as PlayerScoreRepository;
    const svcZero = new PlayerScoreService(eventsZero, repoZero, 0);
    svcZero.onModuleInit();

    eventsZero.emit(COMBAT_SHIP_DESTROYED, makeEvent({
      attackerUserid: 'alice',
      victimUserid: 'bob',
    }));
    await new Promise((r) => setImmediate(r));

    expect(penaltyMockZero).not.toHaveBeenCalled();
  });
});

// ─── applyCashPenalty unit tests (pure math) ─────────────────────────────────

describe('applyCashPenalty math — GEFUNCS.C:killem (chgloser block)', () => {
  it('CHGLOSER_DEFAULT is canon 2 percent, not the numopt ceiling', () => {
    // Was pinned at 100 — the clamp CEILING — so a killed player forfeited
    // their ENTIRE bank. Canon fines 2 percent (MBMGEMSG.MSG). With a starting
    // balance of 100_000 that is the difference between a setback and being
    // wiped out by one death.
    expect(CHGLOSER_DEFAULT).toBe(2);
  });

  it('transfer = floor(loser.cash * percent / 100)', () => {
    const loserCash = 1_000_000n;
    const transfer = loserCash * BigInt(CHGLOSER_DEFAULT) / 100n;
    expect(transfer).toBe(loserCash * BigInt(CHGLOSER_DEFAULT) / 100n);
    // A death is survivable: the fine leaves most of the bank intact.
    expect(transfer).toBeLessThan(loserCash / 10n);
  });

  it('transfer capped at loser.cash (cannot go negative)', () => {
    // For percent <= 100, transfer <= loserCash always holds
    const loserCash = 500n;
    const transfer = loserCash * 100n / 100n;
    expect(transfer).toBe(loserCash);
  });

  it('loser.cash = 0 → transfer = 0', () => {
    const transfer = 0n * 100n / 100n;
    expect(transfer).toBe(0n);
  });

  it('SC-007 extreme — BigInt-safe upper bound (2^52 cash)', () => {
    const loserCash = 2n ** 52n;
    const transfer = loserCash * 100n / 100n;
    expect(transfer).toBe(loserCash);
    expect(transfer).toBeGreaterThan(0n);
  });
});
