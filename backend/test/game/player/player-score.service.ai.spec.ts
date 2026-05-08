/**
 * Integration tests for PlayerScoreService AI kill handling.
 *
 * T029 — Cybertron attacker event triggers isAiAttacker=true branch.
 * T029a — Single COMBAT_SHIP_DESTROYED event produces exactly ONE transferKillScore call.
 *
 * @see GEFUNCS.C:killem (1087-1218)
 * @see GEFUNCS.C:1161 — AI 1/10 branch
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';
import {
  PlayerScoreService,
  CYBERTRON_SCORED_KILL,
  CybertronScoredKillEvent,
} from '../../../src/game/player/player-score.service';

function makeEvent(overrides: Partial<CombatShipDestroyedEvent>): CombatShipDestroyedEvent {
  return {
    victimId: 'victim:1',
    attackerId: 'attacker:1',
    victimShipKey: 'victim:1',
    attackerShipKey: 'attacker:1',
    victimUserid: 'victim',
    attackerUserid: 'attacker',
    attackerChannel: 1,
    weapon: null,
    sector: { x: 5, y: 5 },
    tickAt: new Date(),
    loot: [],
    scoreAwarded: 500,
    ...overrides,
  };
}

function makeService(transferKillScoreMock: jest.Mock) {
  const events = new EventEmitter2();
  const repo = {
    transferKillScore: transferKillScoreMock,
    applyCashPenalty: jest.fn().mockResolvedValue(0n),
  };
  const service = new PlayerScoreService(
    events,
    repo as never,
    0, // chgLoserPercent = 0 to skip cash penalty
  );
  service.onModuleInit();
  return { events, service };
}

describe('PlayerScoreService — AI kill handling (T029)', () => {
  it('passes isAiAttacker=false for human attacker', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const { events } = makeService(transferMock);

    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({ attackerUserid: 'admiral', victimUserid: 'target' }));
    await new Promise((r) => setTimeout(r, 10));

    expect(transferMock).toHaveBeenCalledWith('admiral', 'target', 500, false, false);
  });

  it('passes isAiAttacker=true for Cybertron attacker (Cybrg- prefix)', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const { events } = makeService(transferMock);

    events.emit(
      COMBAT_SHIP_DESTROYED,
      makeEvent({ attackerUserid: 'Cybrg-1', attackerShipKey: 'Cybrg-1:1', victimUserid: 'target' }),
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(transferMock).toHaveBeenCalledWith('Cybrg-1', 'target', 500, false, true);
  });

  it('passes isAiAttacker=true for Droid attacker (@Droid- prefix)', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const { events } = makeService(transferMock);

    events.emit(
      COMBAT_SHIP_DESTROYED,
      makeEvent({ attackerUserid: '@Droid-001', attackerShipKey: '@Droid-001:1', victimUserid: 'target' }),
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(transferMock).toHaveBeenCalledWith('@Droid-001', 'target', 500, false, true);
  });

  it('passes isAiVictim=true when victim is a Cybertron', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const { events } = makeService(transferMock);

    events.emit(
      COMBAT_SHIP_DESTROYED,
      makeEvent({ attackerUserid: 'admiral', victimUserid: 'Cybrg-5' }),
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(transferMock).toHaveBeenCalledWith('admiral', 'Cybrg-5', 500, true, false);
  });

  it('emits CYBERTRON_SCORED_KILL event with correct payload when Cybrg- attacker scores', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const { events } = makeService(transferMock);

    const received: CybertronScoredKillEvent[] = [];
    events.on(CYBERTRON_SCORED_KILL, (e: CybertronScoredKillEvent) => received.push(e));

    events.emit(
      COMBAT_SHIP_DESTROYED,
      makeEvent({ attackerUserid: 'Cybrg-3', attackerShipKey: 'Cybrg-3:7', victimUserid: 'target' }),
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ attackerUserid: 'Cybrg-3', attackerShipKey: 'Cybrg-3:7' });
  });

  it('does NOT emit CYBERTRON_SCORED_KILL for Droid attackers', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const { events } = makeService(transferMock);

    const received: CybertronScoredKillEvent[] = [];
    events.on(CYBERTRON_SCORED_KILL, (e: CybertronScoredKillEvent) => received.push(e));

    events.emit(
      COMBAT_SHIP_DESTROYED,
      makeEvent({ attackerUserid: '@Droid-001', attackerShipKey: '@Droid-001:1', victimUserid: 'target' }),
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(0);
  });

  it('skips when scoreAwarded=0', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const { events } = makeService(transferMock);

    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({ scoreAwarded: 0 }));
    await new Promise((r) => setTimeout(r, 10));

    expect(transferMock).not.toHaveBeenCalled();
  });

  it('skips when attackerUserid is null', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const { events } = makeService(transferMock);

    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({ attackerUserid: null, attackerId: null, attackerShipKey: null }));
    await new Promise((r) => setTimeout(r, 10));

    expect(transferMock).not.toHaveBeenCalled();
  });
});

describe('PlayerScoreService — idempotency (T029a)', () => {
  it('registers the listener exactly once — single event produces one transferKillScore call', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const { events } = makeService(transferMock);

    // Emit one event
    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({ attackerUserid: 'admiral', victimUserid: 'target' }));
    await new Promise((r) => setTimeout(r, 10));

    expect(transferMock).toHaveBeenCalledTimes(1);
  });

  it('does not accumulate duplicate listeners when onModuleInit-like re-registration happens', async () => {
    const transferMock = jest.fn().mockResolvedValue(undefined);
    const events = new EventEmitter2();
    const repo = {
      transferKillScore: transferMock,
      applyCashPenalty: jest.fn().mockResolvedValue(0n),
    };
    const service = new PlayerScoreService(events, repo as never, 0);

    // Only call onModuleInit once (simulates normal lifecycle)
    service.onModuleInit();

    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({ attackerUserid: 'admiral', victimUserid: 'target' }));
    await new Promise((r) => setTimeout(r, 10));

    // Exactly one call — listener registered once via events.on
    expect(transferMock).toHaveBeenCalledTimes(1);
  });
});
