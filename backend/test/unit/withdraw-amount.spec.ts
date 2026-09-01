import { parseWithdrawAmount } from '../../src/game/commands/handlers/helpers/withdraw-amount';

/**
 * `wit <qty>` ignored its argument entirely and always drained the whole tax
 * pool — the handler's parameter was literally named `_args`. The in-game help
 * documents `wit [qty] — withdraw taxes to your account`, so the command
 * promised something it did not do, and a governor who asked for 1 credit had
 * their colony's whole treasury moved.
 *
 * C honours it (GEMAIN.C:3088 mnu_admenu2b):
 *   amt = atol(margv[0]);
 *   if (amt <= plptr->tax) { cash += amt; tax -= amt; } else prfmsg(ADMENU2D);
 */
describe('parseWithdrawAmount', () => {
  const POOL = 60n;

  it('takes the whole pool when no amount is named', () => {
    expect(parseWithdrawAmount(undefined, POOL)).toEqual({ ok: true, amount: 60n });
  });

  it('takes exactly what was asked for', () => {
    expect(parseWithdrawAmount('1', POOL)).toEqual({ ok: true, amount: 1n });
    expect(parseWithdrawAmount('60', POOL)).toEqual({ ok: true, amount: 60n });
  });

  it('refuses more than the pool holds, as C does', () => {
    expect(parseWithdrawAmount('61', POOL)).toEqual({ ok: false, reason: 'TOO_MUCH' });
  });

  it('refuses nonsense and non-positive amounts', () => {
    expect(parseWithdrawAmount('0', POOL)).toEqual({ ok: false, reason: 'BAD_AMOUNT' });
    expect(parseWithdrawAmount('-5', POOL)).toEqual({ ok: false, reason: 'BAD_AMOUNT' });
    expect(parseWithdrawAmount('lots', POOL)).toEqual({ ok: false, reason: 'BAD_AMOUNT' });
  });

  it('handles a pool larger than a 32-bit int', () => {
    const big = 9_000_000_000n;
    expect(parseWithdrawAmount('9000000000', big)).toEqual({ ok: true, amount: big });
  });
});
