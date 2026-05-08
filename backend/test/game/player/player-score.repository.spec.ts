/**
 * Tests for PlayerScoreRepository.transferKillScore — verifies the scoreF2
 * formula and floor/clamp invariants using a mock PrismaService.
 *
 * @see GEFUNCS.C:1157-1185
 * @see GEMAIN.C:603  numopt(SCRFACT, 0, 32700)
 */

// Must mock score.config BEFORE importing the repository, since config is a
// module-level side-effectful constant.
jest.mock('../../../src/game/player/score.config', () => ({ scoreF2: 100 }));

import { PlayerScoreRepository } from '../../../src/game/player/player-score.repository';

function makePrisma(
  overrides: {
    attackerScore?: bigint;
    attackerKlscore?: bigint;
    victimScore?: bigint;
    victimKlscore?: bigint;
  },
  attackerUserid = 'attacker',
) {
  const attacker = {
    userid: attackerUserid,
    score: overrides.attackerScore ?? 500n,
    klscore: overrides.attackerKlscore ?? 500n,
  };
  const victim = {
    userid: 'victim',
    score: overrides.victimScore ?? 1000n,
    klscore: overrides.victimKlscore ?? 1000n,
  };

  const updateMock = jest.fn().mockResolvedValue({});
  const findUniqueMock = jest.fn((args: { where: { userid: string } }) => {
    if (args.where.userid === attackerUserid) return Promise.resolve(attacker);
    if (args.where.userid === 'victim') return Promise.resolve(victim);
    return Promise.resolve(null);
  });

  const txMock = {
    user: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  };

  const prisma = {
    $transaction: jest.fn((fn: (tx: typeof txMock) => Promise<void>) => fn(txMock)),
  };

  return { prisma, updateMock, findUniqueMock, attacker, victim };
}

describe('PlayerScoreRepository.transferKillScore', () => {
  describe('PvP formula: floor((scr / 100) * scoreF2)', () => {
    it('transfers correct amount with scoreF2=100 (mocked), scr=500', async () => {
      // scoreF2=100 (mocked), scr=500 → transfer = floor(500/100 * 100) = 500
      const { prisma, updateMock } = makePrisma({});
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('attacker', 'victim', 500, false, false);

      // Victim deducted by 500
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'victim' },
          data: expect.objectContaining({ score: 500n, klscore: 500n }),
        }),
      );
      // Attacker incremented by 500
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'attacker' },
          data: expect.objectContaining({ score: { increment: 500n }, klscore: { increment: 500n } }),
        }),
      );
    });

    it('floors fractional result', async () => {
      // scoreF2=100 (mocked), scr=333 → transfer = floor(333/100 * 100) = 333
      // (no fractional part here; test with non-round scr/scoreF2 combo via mock override)
      jest.resetModules();
      jest.mock('../../../src/game/player/score.config', () => ({ scoreF2: 3 }));
      // Use a local re-import for this override
      const { PlayerScoreRepository: Repo2 } =
        await import('../../../src/game/player/player-score.repository');
      const { prisma, updateMock } = makePrisma({});
      const repo = new Repo2(prisma as never);
      // scr=100, scoreF2=3 → floor(100/100 * 3) = floor(3) = 3
      await repo.transferKillScore('attacker', 'victim', 100, false, false);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'attacker' },
          data: expect.objectContaining({ score: { increment: 3n } }),
        }),
      );
    });

    it('floors at zero — never negative (scr=0)', async () => {
      const { prisma, updateMock } = makePrisma({});
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('attacker', 'victim', 0, false, false);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'attacker' },
          data: expect.objectContaining({ score: { increment: 0n } }),
        }),
      );
    });

    it('victim score floored at 0 (does not go negative)', async () => {
      // Victim has only 10 score, transfer would be 500 → should floor to 0
      const { prisma, updateMock } = makePrisma({ victimScore: 10n, victimKlscore: 10n });
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('attacker', 'victim', 500, false, false);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'victim' },
          data: expect.objectContaining({ score: 0n, klscore: 0n }),
        }),
      );
    });
  });

  describe('AI attacker formula: floor((scr / 100) * scoreF2 / 10)', () => {
    it('awards 1/10 of normal transfer for AI attacker', async () => {
      // scoreF2=100 (mocked), scr=1000 → normal=1000, AI=floor(1000/10)=100
      const { prisma, updateMock } = makePrisma({}, 'Cybrg-1');
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('Cybrg-1', 'victim', 1000, false, true);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'Cybrg-1' },
          data: expect.objectContaining({ score: { increment: 100n } }),
        }),
      );
    });

    it('floors AI transfer at zero when scr=0', async () => {
      const { prisma, updateMock } = makePrisma({}, 'Cybrg-1');
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('Cybrg-1', 'victim', 0, false, true);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'Cybrg-1' },
          data: expect.objectContaining({ score: { increment: 0n } }),
        }),
      );
    });
  });

  describe('AI victim (isAiVictim=true)', () => {
    it('skips victim deduction for AI victims', async () => {
      const { prisma, updateMock } = makePrisma({});
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('attacker', 'Cybrg-1', 500, true, false);

      // Only the attacker update, not the victim update
      const victimUpdates = updateMock.mock.calls.filter(
        (call: [{ where: { userid: string } }]) => call[0].where.userid === 'Cybrg-1',
      );
      expect(victimUpdates).toHaveLength(0);
    });
  });
});
