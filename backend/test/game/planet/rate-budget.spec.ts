/**
 * Production rates share ONE 100% budget across all items.
 *
 * The constraint is not in GEPLANET.C, which is why it was missed twice — it
 * lives in the rate-entry path, GEMAIN.C:3539-3560 update_items:
 *
 *   for (i=0; i<NUMITEMS; ++i)
 *       if (i != warsptr->titem) pcnt += plptr->items[i].rate;
 *
 *   if ((titems[usrnum].rate + pcnt) > 100)
 *       { titems[usrnum].rate = 100 - pcnt;
 *         if (titems[usrnum].rate > 100) titems[usrnum].rate = 0;
 *         prfmsg(ADMEN2FA, item_name[titem], titems[usrnum].rate); }
 *   i = titems[usrnum].rate + pcnt;
 *   if (i < 100) prfmsg(ADMEN2FB, 100 - i);
 *
 * We validated only `value > 100` per item, with no cross-item sum, so a
 * colony could run eleven items at 100 — 1,100% of a workforce canon caps at
 * 100%. The owner did exactly that on my advice, and the production loop
 * happily obliged, because GEPLANET.C trusts the rates it is given.
 *
 * That is also why "there is no cost, set everything to 100" looked true from
 * the production code alone. The cost is charged at the point of setting.
 */
import { clampRateToBudget } from '../../../src/game/planet/rate-budget';

describe('the shared production budget', () => {
  it('leaves a rate alone when the total fits', () => {
    const rates = [50, 0, 0, 0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(clampRateToBudget(rates, 12, 20)).toEqual({ value: 20, clamped: false, unassigned: 0 });
  });

  it('clamps to what is left when the total would exceed 100', () => {
    const rates = [50, 0, 0, 0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0];
    // 50 + 30 = 80 already committed; asking for 40 gets 20.
    expect(clampRateToBudget(rates, 12, 40)).toEqual({ value: 20, clamped: true, unassigned: 0 });
  });

  it('excludes the item being SET from the sum, so raising it in place works', () => {
    const rates = [50, 0, 0, 0, 0, 30, 0, 0, 0, 0, 0, 0, 20, 0];
    // Gold is already 20. Setting it to 20 again must not read as 100 committed.
    expect(clampRateToBudget(rates, 12, 20).value).toBe(20);
  });

  it('gives zero when the budget is already fully spent', () => {
    const rates = [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(clampRateToBudget(rates, 12, 50)).toEqual({ value: 0, clamped: true, unassigned: 0 });
  });

  it('reports the unassigned remainder, as ADMEN2FB does', () => {
    const rates = new Array(14).fill(0);
    expect(clampRateToBudget(rates, 0, 40).unassigned).toBe(60);
  });

  it('never returns a negative rate', () => {
    // C guards this explicitly: `if (rate > 100) rate = 0` after the subtraction,
    // catching the unsigned wrap when pcnt already exceeds 100.
    const rates = new Array(14).fill(0);
    rates[0] = 90; rates[5] = 90;
    const r = clampRateToBudget(rates, 12, 50);
    expect(r.value).toBe(0);
    expect(r.value).toBeGreaterThanOrEqual(0);
  });
});
