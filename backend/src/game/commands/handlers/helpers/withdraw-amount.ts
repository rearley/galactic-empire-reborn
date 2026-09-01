/**
 * How much of a colony's tax pool `wit` should move.
 *
 * `amt = atol(margv[0]); if (amt <= plptr->tax) { cash += amt; tax -= amt; }
 *  else prfmsg(ADMENU2D);` — C takes the amount asked for and refuses when the
 * pool cannot cover it (GEMAIN.C:3088 mnu_admenu2b).
 *
 * The port ignored the argument and always drained the pool, so a governor who
 * typed `wit 1` moved their colony's whole treasury. A bare `wit` keeps the
 * everything-please meaning, which is the useful default for a command form C
 * did not have (its menu always prompted for an amount).
 */
export type WithdrawAmount =
  | { ok: true; amount: bigint }
  | { ok: false; reason: 'BAD_AMOUNT' | 'TOO_MUCH' };

export function parseWithdrawAmount(arg: string | undefined, pool: bigint): WithdrawAmount {
  const raw = (arg ?? '').trim();
  if (raw === '') return { ok: true, amount: pool };

  if (!/^\d+$/.test(raw)) return { ok: false, reason: 'BAD_AMOUNT' };
  const amount = BigInt(raw);
  if (amount <= 0n) return { ok: false, reason: 'BAD_AMOUNT' };
  if (amount > pool) return { ok: false, reason: 'TOO_MUCH' };
  return { ok: true, amount };
}
