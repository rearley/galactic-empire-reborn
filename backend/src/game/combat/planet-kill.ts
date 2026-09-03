/**
 * `lastfired` value C uses for "a planet's ion cannons did this, not a ship".
 *
 * `ptr->lastfired = -1;` — set by `fireion` before it applies ion damage, so
 * `killem`'s attribution walk finds no attacker and credits the kill to nobody.
 *
 * IMPORTANT: this value is NOT sufficient evidence of a planet kill. This port
 * also uses -1 as `NO_CHANNEL` ("nobody has fired on me"), and
 * ShipStateService resets a victim's `lastfired` to it when the recorded firer
 * leaves the game. Treating -1 alone as "a planet did it" would blame a colony
 * for any death whose attacker had simply disconnected. C shares the overload
 * but never had to name the killer, so it never had to tell them apart.
 *
 * @see GEFUNCS.C:1797 fireion, GEFUNCS.C:226 initshp
 * @see ship-channel.registry.ts NO_CHANNEL
 */
export const IONCANNON_LASTFIRED = -1;

/**
 * How recently a planet must have hit a ship to be credited with killing it.
 *
 * Ion cannons fire on the 6-second physics tick and a fatal hit kills on the
 * same or the following tick, so two ticks of slack is generous. The bound
 * exists so a ship that was shot at, escaped, and died elsewhere later cannot
 * inherit the planet's name.
 */
export const ION_ATTRIBUTION_WINDOW_MS = 15_000;

export interface PlanetKillEvidence {
  /** Whether an attacking SHIP resolved for this kill — if so, it takes it. */
  hasAttackerShip: boolean;
  /** When a planet last hit this ship, or null if none on record. */
  lastIonHitAt: number | null;
  now: number;
}

/** True when a planet's guns should be named as the killer. */
export function attributePlanetKill({
  hasAttackerShip,
  lastIonHitAt,
  now,
}: PlanetKillEvidence): boolean {
  if (hasAttackerShip) return false;
  if (lastIonHitAt === null) return false;
  return now - lastIonHitAt <= ION_ATTRIBUTION_WINDOW_MS;
}
