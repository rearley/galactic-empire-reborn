/**
 * How many AI hulls of each class should exist, given the size of the galaxy.
 *
 * Canon has no such function. `GECYBS.C` carries a fixed `tot_to_create` per
 * class — 10 Scouts, 5 Battle Cruisers, 1 Base Star, 6 Sarten Attack Drones,
 * 2 Obliterators, 24 in all — and spawns them uniformly across the universe
 * with no reference to `UNIVMAX`. At canon's 300 that is 24 hulls in
 * 601x601 = 361,201 sectors, and finding one is most of the work.
 *
 * We deploy at UNIVMAX 100 — 201x201 = 40,401 sectors, an eighth of the area.
 * Canon's fixed count there is ~9x canon's DENSITY, and because the payout per
 * kill is canon to the credit (`rnd()%1200` gold at 1000 cr, salvage divided
 * by `rnd()%5+1`, ~275,000 cr expected), the credits-per-hour is ~9x canon
 * too. A 2,000,000 cr Dreadnought is ~7 Cybertron kills either way; what
 * changes is how long those 7 take to find. Canon gates a hull purchase on
 * cash ALONE (`GECMDS.C:4568`), so nothing else slows that run down.
 *
 * This deviation was therefore not chosen — it fell out of the UNIVMAX one,
 * and it is the single biggest reason the economy would feel unlike 1992.
 *
 * Scaling is LINEAR in UNIVMAX rather than by area. Area is the honest model
 * of density, but 24 * (100/300)^2 is under 3 hulls, which empties the galaxy
 * of the thing players are meant to hunt. Linear keeps ~9 and, more
 * importantly, is a no-op at 300: raise UNIVMAX for a busier server later and
 * the population follows on its own, with canon's exact numbers restored the
 * moment the galaxy is canon's size again.
 *
 * Droid population is deliberately NOT scaled. Droids are ephemeral, capped at
 * `DROID_MAX_PER_CLASS` (2), and canon gives gold to the Murdonian alone
 * (`GEDROIDS.C:155`, `rnd()%250`) — the Vakory and the Scow carry none. They
 * are the low-value target supply, and thinning them would leave a new pilot
 * with nothing to shoot.
 *
 * @see GECYBS.C — the class table and its fixed tot_to_create
 * @see docs/DECISIONS.md — AI population scales with UNIVMAX
 */

/** Canon's galaxy half-extent, and the size its AI counts were chosen for. */
export const CANON_UNIVMAX = 300 as const;

/** Canon's per-class `tot_to_create`, before any scaling. @see GECYBS.C */
export const CANON_TOT_TO_CREATE: Readonly<Record<number, number>> = Object.freeze({
  21: 10, // Cybertron Scout
  22: 5,  // Cybertron Battle Cruiser
  23: 1,  // Cybertron Base Star — canon's single boss hull
  24: 6,  // Sarten Attack Drone
  25: 2,  // Sarten Obliterator
});

/**
 * Canon's count for one class, scaled to the galaxy we actually run.
 *
 * Never returns 0 for a class canon populates: rounding deletes the Base Star
 * at any UNIVMAX below 450, and a hull that never spawns is a hull no player
 * learns exists. One of everything is the floor.
 */
export function scaleAiPopulation(canonCount: number, univmax: number): number {
  if (canonCount <= 0) return 0;
  const scaled = Math.round((canonCount * univmax) / CANON_UNIVMAX);
  return Math.max(1, scaled);
}
