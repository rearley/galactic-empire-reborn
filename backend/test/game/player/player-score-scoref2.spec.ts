/**
 * `scoreF2` scales the victim's deduction and nothing else.
 *
 * This needs its own file because `score.config` is a module-level constant
 * and a module mock is hoisted above the whole file — the original attempt at
 * a local override lived inside a test, was hoisted past it, and the file-wide
 * mock is what actually ran. The assertion it left behind read the attacker's
 * award, which `scoreF2` cannot affect, so it could not have failed whatever
 * the knob was set to. @see issue #33
 *
 * Here the knob is 3, not the shipped 100, so the two halves of a kill's score
 * movement come apart and the deduction has to be doing the scaling.
 *
 * @see GEFUNCS.C:1157 `	ded_amt = (amt/100L)*score_f2;`
 */
vi.mock('../../../src/game/player/score.config', () => ({ scoreF2: 3 }));

import { PlayerScoreRepository } from '../../../src/game/player/player-score.repository';

function makePrisma() {
  const updateMock = vi.fn().mockResolvedValue({});
  const tx = {
    user: {
      findUnique: vi.fn((args: { where: { userid: string } }) =>
        Promise.resolve(
          args.where.userid === 'victim'
            ? { userid: 'victim', score: 1000n, klscore: 1000n }
            : { userid: 'attacker', score: 500n, klscore: 500n },
        ),
      ),
      update: updateMock,
    },
  };
  return { prisma: { $transaction: vi.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)) }, updateMock };
}

describe('transferKillScore at scoreF2 = 3', () => {
  it('scales the victim deduction by scoreF2 — 100 points costs 3', async () => {
    const { prisma, updateMock } = makePrisma();
    await new PlayerScoreRepository(prisma as never).transferKillScore('attacker', 'victim', 100, false, false);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: 'victim' },
        data: { score: 997n, klscore: 997n },
      }),
    );
  });

  it('leaves the attacker award at the full amount', async () => {
    const { prisma, updateMock } = makePrisma();
    await new PlayerScoreRepository(prisma as never).transferKillScore('attacker', 'victim', 100, false, false);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: 'attacker' },
        data: expect.objectContaining({ score: { increment: 100n } }),
      }),
    );
  });

  it('divides the deduction by ten again when a Cybertron made the kill', async () => {
    const { prisma, updateMock } = makePrisma();
    // ded = trunc(trunc(1000/100) * 3) = 30, then /10 for an AI attacker = 3.
    // Args are (attacker, victim, scr, isAiVictim, isAiAttacker) — an AI
    // ATTACKER, and a human victim who therefore still has a row to debit.
    await new PlayerScoreRepository(prisma as never).transferKillScore('Cybrg-001', 'victim', 1000, false, true);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: 'victim' },
        data: { score: 997n, klscore: 997n },
      }),
    );
  });
});
