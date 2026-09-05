/**
 * Production rates share ONE 100% budget across every item.
 *
 * @see GEMAIN.C:3539-3560 update_items
 *
 *   for (i=0; i<NUMITEMS; ++i)
 *       if (i != warsptr->titem) pcnt += plptr->items[i].rate;
 *
 *   if ((titems[usrnum].rate + pcnt) > 100)
 *       { titems[usrnum].rate = 100 - pcnt;
 *         if (titems[usrnum].rate > 100) titems[usrnum].rate = 0; ... }
 *
 * The constraint lives at the point a rate is SET, not in the production loop —
 * GEPLANET.C trusts whatever rates it is handed. That is why reading the
 * production code alone made "no cost, set everything to 100" look true: the
 * cost is charged on entry, and we were not charging it. A colony could run
 * eleven items at 100, i.e. 1,100% of a workforce canon caps at 100%.
 *
 * The `> 100` re-test after the subtraction is canon's guard against the
 * unsigned wrap when `pcnt` already exceeds 100; it yields 0 rather than a
 * huge positive. Preserved here as an explicit floor.
 */
export interface RateClampResult {
  /** The rate actually stored, after clamping. */
  value: number;
  /** True when the request was reduced — the caller reports ADMEN2FA. */
  clamped: boolean;
  /** Effort left unallocated across all items — the caller reports ADMEN2FB. */
  unassigned: number;
}

export function clampRateToBudget(
  rates: readonly number[],
  itemIndex: number,
  requested: number,
): RateClampResult {
  // `if (i != warsptr->titem)` — the item being set is excluded, so raising a
  // rate in place is measured against the OTHERS, not against itself.
  let committed = 0;
  for (let i = 0; i < rates.length; i++) {
    if (i === itemIndex) continue;
    committed += rates[i] ?? 0;
  }

  let value = requested;
  let clamped = false;
  if (requested + committed > 100) {
    value = 100 - committed;
    if (value > 100 || value < 0) value = 0;
    clamped = true;
  }

  const total = value + committed;
  return { value, clamped, unassigned: total < 100 ? 100 - total : 0 };
}
