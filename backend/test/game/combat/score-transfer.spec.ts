/**
 * Score transfer on kill — GEFUNCS.C:killem (1143-1185).
 * When a ship is destroyed, the victim's ship class `points` value is awarded
 * to the attacker's score and klscore. The same amount is deducted from the
 * victim (floor at 0). AI ships (Cybrg-* / Droid-*) are never penalised.
 *
 * @see GEFUNCS.C:killem — lines 1143-1185
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';
import { PlayerScoreService } from '../../../src/game/player/player-score.service';
import { PlayerScoreRepository } from '../../../src/game/player/player-score.repository';

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

function buildHarness() {
  const events = new EventEmitter2();
  const transferKillScore = jest.fn().mockResolvedValue(undefined);
  const repo = { transferKillScore, getRospos: jest.fn().mockResolvedValue(0) } as unknown as PlayerScoreRepository;
  const svc = new PlayerScoreService(events, repo, 0);
  svc.onModuleInit();
  return { events, transferKillScore };
}

// ─── PlayerScoreService listener behaviour ───────────────────────────────────

describe('PlayerScoreService — COMBAT_SHIP_DESTROYED score transfer', () => {
  it('calls transferKillScore for player-kills-player with isAiVictim=false', async () => {
    const { events, transferKillScore } = buildHarness();
    events.emit(COMBAT_SHIP_DESTROYED, makeEvent());
    await new Promise((r) => setImmediate(r));
    expect(transferKillScore).toHaveBeenCalledWith('attacker', 'victim', 50, false, false);
  });

  it('calls transferKillScore with isAiVictim=true when victim is Cybrg-*', async () => {
    const { events, transferKillScore } = buildHarness();
    events.emit(
      COMBAT_SHIP_DESTROYED,
      makeEvent({ victimUserid: 'Cybrg-7', victimShipKey: 'Cybrg-7:1', victimId: 'Cybrg-7:1' }),
    );
    await new Promise((r) => setImmediate(r));
    expect(transferKillScore).toHaveBeenCalledWith('attacker', 'Cybrg-7', 50, true, false);
  });

  it('calls transferKillScore with isAiVictim=true when victim is Droid-*', async () => {
    const { events, transferKillScore } = buildHarness();
    events.emit(
      COMBAT_SHIP_DESTROYED,
      makeEvent({ victimUserid: '@Droid-3', victimShipKey: '@Droid-3:1', victimId: '@Droid-3:1' }),
    );
    await new Promise((r) => setImmediate(r));
    expect(transferKillScore).toHaveBeenCalledWith('attacker', '@Droid-3', 50, true, false);
  });

  it('skips transferKillScore when scoreAwarded is 0', async () => {
    const { events, transferKillScore } = buildHarness();
    events.emit(COMBAT_SHIP_DESTROYED, makeEvent({ scoreAwarded: 0 }));
    await new Promise((r) => setImmediate(r));
    expect(transferKillScore).not.toHaveBeenCalled();
  });

  it('skips transferKillScore when attackerUserid is null (mine kill / no attacker)', async () => {
    const { events, transferKillScore } = buildHarness();
    events.emit(
      COMBAT_SHIP_DESTROYED,
      makeEvent({ attackerUserid: null, attackerId: null, attackerShipKey: null }),
    );
    await new Promise((r) => setImmediate(r));
    expect(transferKillScore).not.toHaveBeenCalled();
  });
});

// ─── PlayerScoreRepository floor logic ───────────────────────────────────────

describe('PlayerScoreRepository — score floor at 0 (GEFUNCS.C:killem 1165-1182)', () => {
  function buildRepo(prisma: unknown) {
    return new PlayerScoreRepository(prisma as never);
  }

  it('victim score and klscore floor at 0 when scr exceeds current values', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) =>
        fn({
          user: {
            findUnique: jest.fn().mockResolvedValue({ score: 10n, klscore: 5n }),
            update: updateMock,
          },
        }),
      ),
    };
    const repo = buildRepo(prisma);
    await repo.transferKillScore('attacker', 'victim', 500, false, false);

    const victimCall = updateMock.mock.calls.find(
      (c: unknown[]) => (c[0] as { where: { userid: string } }).where.userid === 'victim',
    );
    expect(victimCall).toBeDefined();
    const data = (victimCall![0] as { data: { score: bigint; klscore: bigint } }).data;
    expect(data.score).toBe(0n);
    expect(data.klscore).toBe(0n);
  });

  /**
   * `ded_amt = (amt/100L)*score_f2` is long arithmetic, so `amt/100` truncates
   * BEFORE the multiply. A kill worth under 100 points therefore costs the
   * victim nothing at all, and 750 points costs 700 rather than 750. The port
   * carried a float through and lost that.
   * @see GEFUNCS.C:1157
   */
  it('a sub-100-point kill costs the victim nothing (amt/100 truncates to 0)', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) =>
        fn({
          user: {
            findUnique: jest.fn().mockResolvedValue({ score: 1000n, klscore: 800n }),
            update: updateMock,
          },
        }),
      ),
    };
    const repo = buildRepo(prisma);
    await repo.transferKillScore('attacker', 'victim', 50, false, false);

    const victimCall = updateMock.mock.calls.find(
      (c: unknown[]) => (c[0] as { where: { userid: string } }).where.userid === 'victim',
    );
    const data = (victimCall![0] as { data: { score: bigint; klscore: bigint } }).data;
    expect(data.score).toBe(1000n);
    expect(data.klscore).toBe(800n);
  });

  it('deducts (amt/100)*score_f2 for a kill worth more than 100', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) =>
        fn({
          user: {
            findUnique: jest.fn().mockResolvedValue({ score: 5000n, klscore: 5000n }),
            update: updateMock,
          },
        }),
      ),
    };
    const repo = buildRepo(prisma);
    // 750/100 = 7, * scoreF2 100 = 700.
    await repo.transferKillScore('attacker', 'victim', 750, false, false);

    const victimCall = updateMock.mock.calls.find(
      (c: unknown[]) => (c[0] as { where: { userid: string } }).where.userid === 'victim',
    );
    const data = (victimCall![0] as { data: { score: bigint; klscore: bigint } }).data;
    expect(data.score).toBe(4300n);
    expect(data.klscore).toBe(4300n);
  });

  it('skips victim deduction when isAiVictim=true', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const findUniqueMock = jest.fn().mockResolvedValue({ score: 0n, klscore: 0n });
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) =>
        fn({
          user: {
            findUnique: findUniqueMock,
            update: updateMock,
          },
        }),
      ),
    };
    const repo = buildRepo(prisma);
    await repo.transferKillScore('attacker', 'Cybrg-7', 50, true, false);

    // findUnique should only be called for the attacker row, not for Cybrg-7.
    const victimLookup = findUniqueMock.mock.calls.find(
      (c: unknown[]) => (c[0] as { where: { userid: string } }).where.userid === 'Cybrg-7',
    );
    expect(victimLookup).toBeUndefined();
  });

  it('attacker score and klscore are incremented', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) =>
        fn({
          user: {
            findUnique: jest.fn().mockResolvedValue({ score: 100n, klscore: 100n }),
            update: updateMock,
          },
        }),
      ),
    };
    const repo = buildRepo(prisma);
    await repo.transferKillScore('attacker', 'victim', 75, false, false);

    const attackerCall = updateMock.mock.calls.find(
      (c: unknown[]) => (c[0] as { where: { userid: string } }).where.userid === 'attacker',
    );
    expect(attackerCall).toBeDefined();
    const data = (attackerCall![0] as { data: { score: { increment: bigint }; klscore: { increment: bigint } } }).data;
    expect(data.score).toEqual({ increment: 75n });
    expect(data.klscore).toEqual({ increment: 75n });
  });
});
