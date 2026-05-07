/**
 * Item keyword resolution helper — case-insensitive prefix match against the
 * canonical kwrd[] table from GEMAIN.H.
 *
 * `gold` is a synonym for I_GOLD (index 12) per research.md D1.
 *
 * @see GEMAIN.H kwrd[] table
 * @see GECMDS.C:genearas — prefix-match lookup used by buy/sell/transfer/jettison
 */

import { ITEM_NAMES, I_GOLD } from '../../constants/items';

/** Lower-cased canonical item keywords derived from ITEM_NAMES. */
const CANONICAL_KEYWORDS: readonly string[] = Object.freeze(
  ITEM_NAMES.map((n) => n.toLowerCase()),
);

/**
 * Resolve a player-typed item keyword to a cargo-array index (0–13).
 * Accepts:
 *   - Case-insensitive prefix match against canonical item names (e.g. "tor" → I_TORP=2)
 *   - "gold" synonym for I_GOLD=12
 *
 * Returns the matched index, or -1 if no match (or ambiguous).
 */
export function resolveItemKeywordByName(raw: string): number {
  const lower = raw.toLowerCase();

  // Gold synonym.
  if (lower === 'gold') return I_GOLD;

  // Prefix match — return first match.
  for (let i = 0; i < CANONICAL_KEYWORDS.length; i++) {
    if (CANONICAL_KEYWORDS[i].startsWith(lower)) {
      return i;
    }
  }
  return -1;
}
