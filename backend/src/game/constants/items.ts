/**
 * Planet item constants — canonical defaults from MBMGEMSG.MSG via reference/wiki/items.md.
 * Hardcoded (NOT env-configurable) per research Decision 9.
 * @see GEMAIN.H:141-156
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

/** Base price per item. @see reference/wiki/items.md */
export const BASEPRICE: readonly number[] = Object.freeze([
  2, 20, 7, 33, 200, 2, 50, 18, 1, 99, 21, 16, 100, 100,
]);

/** Manhours per item — used in multiply() production formula. @see GEPLANET.C:multiply */
export const MANHOURS: readonly number[] = Object.freeze([
  3500, 300, 500, 4, 200, 8000, 100, 900, 200, 100, 300, 500, 30, 20,
]);

/** Maximum planet inventory per item. @see reference/wiki/items.md */
export const MAXPL: readonly number[] = Object.freeze([
  1_000_000_000,
     50_000_000,
     50_000_000,
        500_000,
     20_000_000,
    100_000_000,
        500_000,
     50_000_000,
     20_000_000,
     50_000_000,
     20_000_000,
     50_000_000,
      5_000_000,
         10_000,
]);

/** Cargo tons per unit of each item. @see reference/wiki/items.md */
export const ITEM_TONS: readonly number[] = Object.freeze([
  1, 5, 3, 250, 20, 2, 15, 3, 2, 5, 4, 5, 0.5, 1,
]);
