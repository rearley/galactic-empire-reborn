/**
 * Item keyword resolution helper — case-insensitive prefix match against the
 * canonical kwrd[] table from GEMAIN.H.
 *
 * `gold` is a synonym for I_GOLD (index 12) per research.md D1.
 *
 * @see GEMAIN.H kwrd[] table
 * @see GECMDS.C:genearas — prefix-match lookup used by buy/sell/transfer/jettison
 */

import { ITEM_NAMES, ITEM_KEYWORDS, I_GOLD } from '../../constants/items';

/**
 * Resolve a player-typed item keyword to a cargo-array index (0-13).
 *
 * Canon matches `genearas(kwrd[i], margv[n])` against the THREE-LETTER table
 * (GECMDS.C:3287 and five other sites), which is why `buy 10 tor` works. We
 * accept that and the full display name, because players type both:
 *
 *   input starts with the canon keyword   ->  "tor", "torpedoes", "torps"
 *   display name starts with the input    ->  "torp", "torpedo", "torpedos"
 *
 * Both directions are needed. Canon's names are not the words players reach
 * for — canon spells it "torpedos" and calls a spy "spy", so "torpedoes" and
 * "spies" only resolve through the keyword arm; and "food" only resolves
 * through the name arm, since the keyword is "foo".
 *
 * First match wins, in slot order, exactly as canon's loop does.
 *
 * @see GEMAIN.H kwrd[] table, GECMDS.C:80-108
 */
export function resolveItemKeywordByName(raw: string): number {
  const lower = raw.trim().toLowerCase();
  if (lower === '') return -1;

  for (let i = 0; i < ITEM_KEYWORDS.length; i++) {
    if (lower.startsWith(ITEM_KEYWORDS[i]) || ITEM_NAMES[i].startsWith(lower)) {
      return i;
    }
  }
  return -1;
}

/** Index of gold, re-exported for call sites that special-cased it. */
export { I_GOLD };
