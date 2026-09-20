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

/**
 * How long a class stays empty after one of its hulls dies.
 *
 * PORT-ORIGINAL. Canon has no respawn delay at all: `autortia` examines one
 * ship slot every 30 seconds and refills whatever it finds free
 * (GEMAIN.C:2321 `if (ticktock2 >= 30 && ticktock1 < nships)`), so the wait is
 * an accident of where the walk pointer happens to be when you make the kill.
 * Canon expresses "this hull is special" ONLY as rarity — `tot_to_create` 2 for
 * an Obliterator against 10 for a Scout.
 *
 * That lever loses its force at our galaxy size. `scaleAiPopulation` rounds
 * canon's two Obliterators down to ONE at UNIVMAX 100, so killing it empties
 * the galaxy of the class, and the port put it back within three minutes,
 * guaranteed. Reported from play as taking the wind out of the kill.
 *
 * So rarity is re-expressed as TIME, using canon's own numbers rather than a
 * table invented for the purpose: the delay is the base multiplied by how much
 * rarer the class is than canon's commonest Cybertron. Nothing respawns faster
 * than the port already did — the base is the floor, so this only ever takes a
 * hull away for longer.
 *
 *   Scout (10)             3 min      Attack Drone (6)      5 min
 *   Battle Cruiser (5)     6 min      Obliterator (2)      15 min
 *   Base Star (1)         30 min
 *
 * A deviation argued from feel is normally exactly what `CLAUDE.md` forbids.
 * This one is deliberate, owner-chosen over two canon-grounded alternatives,
 * and recorded with them. @see docs/DECISIONS.md 2026-09-20
 */

/** What the port's spawn slot already cost: 30 physics ticks at 6s. */
export const CYB_RESPAWN_BASE_MS = 30 * 6 * 1000;

/** Canon's commonest Cybertron, the Scout at `tot_to_create` 10. The yardstick. */
export const CANON_MOST_COMMON = 10 as const;

export function respawnDelayMs(canonCount: number, baseMs: number = CYB_RESPAWN_BASE_MS): number {
  if (canonCount <= 0) return baseMs;
  // Clamped at the base: a class canon makes MORE common than the Scout would
  // otherwise respawn faster than the port managed before this existed, which
  // is the one thing this must never do.
  return Math.max(baseMs, Math.round((baseMs * CANON_MOST_COMMON) / canonCount));
}
