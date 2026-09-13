/**
 * One definition of "a ship class a player may buy".
 *
 * Canon bounds BOTH the listing and the purchase at `cyb_class` — the index of
 * the first CYBORG class, 21 in the shipped table (GECMDS.C:378
 * `for (i=0;i<cyb_class;++i)` and :4562-4566
 * `type >= 0 && type < cyb_class && ... == CLASSTYPE_USER`). Category alone is
 * not the rule: filtering on it advertised the Sysopian Death Star (class 41,
 * 32M credits, warp 255, 100M tons) to every pilot from day one.
 *
 * This lives in one place because it had already drifted into two. `new ship`
 * carried the bound; onboarding's class list and its reply validator filtered
 * on category alone, which is the version already found to be wrong once.
 * @see issue #21
 */

/**
 * cyb_class — the index of the first CYBORG entry. GEMAIN.C:881-882 computes
 * it; in the shipped table the first CYBORG is class 21.
 */
export const FIRST_CPU_CLASS = 21;

/** The shape both call sites have: a row from the class table or the cache. */
export interface BuyableClassLike {
  classNumber: number;
  category: string;
}

/**
 * A type guard, not a plain predicate: every call site immediately uses the row
 * it just checked, so narrowing `null | undefined` away here saves each of them
 * repeating the null test that the bound check already implies.
 */
export function isPlayerBuyableClass<T extends BuyableClassLike>(c: T | null | undefined): c is T {
  if (!c) return false;
  return c.category === 'PLAYER' && c.classNumber < FIRST_CPU_CLASS;
}
