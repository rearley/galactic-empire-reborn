/**
 * Planet item constants.
 *
 * MAXPL, ITEM_TONS, ITEM_VALUE and MANHOURS are read from the ORIGINAL option
 * database, MBMGEMSG.MSG, by `node tools/extract-item-tables.mjs`, and pinned
 * by test/balance/item-tables-canon.balance.spec.ts. They previously carried
 * "@see reference/wiki/items.md" -- a summary page whose numbers are rounded,
 * and wrong: it put the ion cannon planet cap at 500_000 against canon's 250
 * and spies at 10_000 against 5. On gold's cargo weight the wiki was RIGHT and
 * we were wrong twice over: 0.5 tons per unit, from ITMWT13 {Weight of 100
 * Gold: 50}. The 2 came from GE/MSG/MBMGEMSG.MSG, an earlier partial snapshot
 * of the option database that the C source cannot even run against.
 *
 * BASEPRICE used to be the exception, on the belief that ITMPR01+ post-dated
 * the shipped .MSG. That was an artefact of reading GE/MSG/MBMGEMSG.MSG, an
 * earlier partial snapshot. The shipped file, GE/REL/MBMGEMSG.MSG, carries all
 * 25 ITMPR blocks, and they agree with the wiki-sourced table item for item.
 * BASEPRICE is now canon-derived and pinned like the rest.
 *
 * @see GEMAIN.C:550-570 — the five parallel option families
 * @see GEMAIN.H:141-157
 */

export const NUMITEMS = 14 as const;

// Item index aliases — GEMAIN.H:143-156
export const I_MEN     = 0 as const;
export const I_MISSL   = 1 as const;
export const I_TORP    = 2 as const;
export const I_ION     = 3 as const;
export const I_FLUX    = 4 as const;
export const I_FOOD    = 5 as const;
export const I_FIGHTER = 6 as const;
export const I_DECOY   = 7 as const;
export const I_TROOPS  = 8 as const;
export const I_ZIPPER  = 9 as const;
export const I_JAMMER  = 10 as const;
export const I_MINE    = 11 as const;
export const I_GOLD    = 12 as const;
export const I_SPY     = 13 as const;

export const ITEM_NAMES: readonly string[] = Object.freeze([
  'Men', 'Missiles', 'Torpedoes', 'Ion Cannons', 'Flux Pods', 'Food Cases',
  'Fighters', 'Decoys', 'Troops', 'Zippers', 'Jammers', 'Mines', 'Gold', 'Spies',
]);

/**
 * Base price per item.
 *
 * NOT canon: the shipped MBMGEMSG.MSG has no ITMPR blocks (see file header), so
 * these come from the wiki and cannot be verified against the original. Gold is
 * the one that matters -- it is the cash-to-gold bank rate at Zygor -- and the
 * wiki disagrees with itself: sysop-options.md and colonizing-planets.md both
 * say 1000, while items.md says 100. items.md is the same summary row that gets
 * gold's WEIGHT demonstrably wrong, so the two agreeing sources win.
 * @see docs/DECISIONS.md — gold base price
 */
export const BASEPRICE: readonly number[] = Object.freeze([
  2, 20, 7, 33, 200, 2, 50, 18, 1, 99, 21, 16, 1000, 100,
]);

/** Units produced per 10K man-weeks. @see MBMGEMSG.MSG ITMMH01-14, GEPLANET.C:multiply */
export const MANHOURS: readonly number[] = Object.freeze([
  3500, 300, 500, 4, 200, 8000, 100, 900, 200, 100, 300, 500, 30, 20,
]);

/**
 * Maximum stock of each item on one planet. @see MBMGEMSG.MSG ITMPL01-14
 *
 * The wiki's rounded figures were out by up to three orders of magnitude. The
 * ion cannon cap is the one that reached the player: at 500_000 a mature colony
 * mounts a planetary battery the original could never accumulate, and a new
 * pilot who stumbles onto a developed world is killed by fire that should not
 * exist. Canon is 250.
 */
export const MAXPL: readonly number[] = Object.freeze([
  201_228_378, // men
       39_633, // missiles
       59_833, // torpedoes
          250, // ion cannons
          923, // flux pods
  187_312_837, // food
      579_332, // fighters
        5_399, // decoys
  201_228_378, // troops
        5_233, // zippers
       25_928, // jammers
       25_867, // mines
       10_000, // gold
            5, // spies
]);

/**
 * Cargo tons per ONE unit. @see MBMGEMSG.MSG ITMWT01-14
 *
 * The option is "Weight of 100 <item>", so each value is the option / 100.
 * Thirteen of the fourteen were already right; gold read 0.5 where canon's
 * 200-per-100 gives 2, making it four times cheaper to haul than it should be.
 */
export const ITEM_TONS: readonly number[] = Object.freeze([
  1, 5, 3, 250, 20, 2, 15, 3, 2, 5, 4, 5, 0.5, 1,
]);

/**
 * Score value per unit, for planet valuation. @see MBMGEMSG.MSG ITMVAL01-14
 *
 * Only men score, at 10 points each; every other item is worth zero. This is
 * NOT the same table as BASEPRICE, which is what valuePlanet currently uses.
 * @see GEMAIN.C:561 value[i] = lngopt(ITMVAL01+i,...)
 */
export const ITEM_VALUE: readonly number[] = Object.freeze([
  10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);
