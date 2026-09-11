/**
 * Tests for PlayerScoreRepository.transferKillScore — verifies the scoreF2
 * formula and floor/clamp invariants using a mock PrismaService.
 *
 * @see GEFUNCS.C:1157-1185
 * @see GEMAIN.C:603  numopt(SCRFACT, 0, 32700)
 */

// Must mock score.config BEFORE importing the repository, since config is a
// module-level side-effectful constant.
vi.mock('../../../src/game/player/score.config', () => ({ scoreF2: 100 }));

import { killScoreAward, killScoreDeduction } from '../../../src/game/player/kill-score';
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

  const updateMock = vi.fn().mockResolvedValue({});
  const findUniqueMock = vi.fn((args: { where: { userid: string } }) => {
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
    $transaction: vi.fn((fn: (tx: typeof txMock) => Promise<void>) => fn(txMock)),
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

    // WAS: "scales only the victim's deduction by scoreF2, never the award",
    // with a nested `vi.mock` of score.config re-registering scoreF2 as 3 and a
    // local re-import to pick it up. The nested registration never did anything
    // — a module mock is HOISTED above the whole file in both Jest and Vitest,
    // so the file-level `scoreF2: 100` on line 11 was always what ran. Vitest
    // refuses the nested call outright, which is how this surfaced.
    //
    // The assertion below is untouched and still holds, because it only ever
    // checked the ATTACKER'S AWARD — which the test's own comment says scoreF2
    // never touches. So it could not have failed whatever scoreF2 was, and the
    // victim's deduction, the thing the old name claimed to cover, is not
    // asserted here at all. Renamed to what it actually verifies. @see issue #33
    it('leaves the attacker award unscaled — scoreF2 applies to the deduction only', async () => {
      // The attacker's award is `amt` and is never touched by score_f2
      // (GEFUNCS.C:1183). Only the deduction is `(amt/100)*score_f2`.
      const { prisma, updateMock } = makePrisma({});
      const repo = new PlayerScoreRepository(prisma as never);
      await repo.transferKillScore('attacker', 'victim', 100, false, false);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'attacker' },
          data: expect.objectContaining({ score: { increment: 100n } }),
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

  describe('AI attacker: only the victim\'s deduction is divided by ten', () => {
    it('still books the full amount for the Cybertron', async () => {
      // GEFUNCS.C:1161 divides `ded_amt` by ten, not `amt` — dying to a
      // Cybertron stings less, but the Cybertron scores the same as anyone.
      const { prisma, updateMock } = makePrisma({}, 'Cybrg-1');
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('Cybrg-1', 'victim', 1000, false, true);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'Cybrg-1' },
          data: expect.objectContaining({ score: { increment: 1000n } }),
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

  describe('User.kills counter', () => {
    it('increments attacker.kills on a human-attacker kill', async () => {
      const { prisma, updateMock } = makePrisma({});
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('attacker', 'victim', 500, false, false);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'attacker' },
          data: expect.objectContaining({ kills: { increment: 1 } }),
        }),
      );
    });

    it('does NOT increment attacker.kills for AI attacker', async () => {
      const { prisma, updateMock } = makePrisma({}, 'Cybrg-1');
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('Cybrg-1', 'victim', 1000, false, true);

      const attackerCalls = updateMock.mock.calls.filter(
        (call) =>
          (call[0] as { where: { userid: string }; data: Record<string, unknown> }).where.userid ===
          'Cybrg-1',
      );
      for (const [args] of attackerCalls) {
        expect((args as { data: Record<string, unknown> }).data).not.toHaveProperty('kills');
      }
    });
  });

  describe('AI victim (isAiVictim=true)', () => {
    it('skips victim deduction for AI victims', async () => {
      const { prisma, updateMock } = makePrisma({});
      const repo = new PlayerScoreRepository(prisma as never);

      await repo.transferKillScore('attacker', 'Cybrg-1', 500, true, false);

      // Only the attacker update, not the victim update
      const victimUpdates = updateMock.mock.calls.filter(
        (call) => (call[0] as { where: { userid: string } }).where.userid === 'Cybrg-1',
      );
      expect(victimUpdates).toHaveLength(0);
    });
  });
});

/**
 * The attacker's award and the victim's deduction are two different numbers.
 *
 * GEFUNCS.C:1155-1184:
 *
 *   amt     = scr + bonus;
 *   ded_amt = (amt/100L)*score_f2;
 *   if (killed by a Cybertron) ded_amt = ded_amt/10;
 *   ... victim loses ded_amt ...
 *   (wuptr->score)   += amt;      // the ATTACKER gets the unscaled amount
 *   (wuptr->klscore) += amt;
 *
 * Only `ded_amt` is scaled by score_f2, and only `ded_amt` is divided by ten
 * when an AI made the kill. The port computed a single `transfer` and used it
 * for both sides, so at any score_f2 other than the shipped 100 the attacker's
 * award was scaled too — and an AI kill paid a tenth of what it should.
 *
 * Latent at the default (score_f2 = 100 makes ded_amt == amt), which is why it
 * survived: change the knob and the two sides silently diverge.
 */
describe('kill score — award and deduction are computed separately', () => {
  it('awards the attacker the full amount regardless of score_f2', () => {
    expect(killScoreAward(750)).toBe(750);
  });

  it('deducts (amt/100)*score_f2, truncating the division first', () => {
    // 750/100 = 7 in C's long arithmetic, so the deduction is 700, not 750.
    expect(killScoreDeduction(750, 100, false)).toBe(700);
    expect(killScoreDeduction(750, 50, false)).toBe(350);
    expect(killScoreDeduction(750, 0, false)).toBe(0);
  });

  it('divides only the DEDUCTION by ten when an AI made the kill', () => {
    expect(killScoreDeduction(750, 100, true)).toBe(70);
    // The Cybertron still books the whole amount.
    expect(killScoreAward(750)).toBe(750);
  });

  it('truncates as C\'s long arithmetic does — (amt/100)*score_f2', () => {
    // amt/100 truncates FIRST: 199/100 = 1, then *100 = 100, not 199.
    expect(killScoreDeduction(199, 100, false)).toBe(100);
  });
});
