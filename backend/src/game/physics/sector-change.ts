/**
 * The state changes C applies when a ship crosses into a new sector.
 *
 *   ptr->hostile = 0;
 *   if (ptr->destruct > 0 && neutral(&newsect))
 *     { prfmsg(SELFD4); ptr->destruct = 0; }
 *
 * Neither happened in the port: `hostile` was written by planet attacks and
 * cleared by nothing, and an armed self-destruct kept counting down after the
 * ship reached the neutral zone, so running for the one safe place in the
 * galaxy did not save you.
 *
 * Returns true when a self-destruct was cancelled, so the caller can send
 * SELFD4.
 *
 * @see GEFUNCS.C:724-730 moveship  @see GEPLANET.C:866 neutral
 */
export function applySectorChangeEffects(
  ship: { hostile: number; destruct: number },
  newSector: { x: number; y: number },
): boolean {
  ship.hostile = 0;

  if (ship.destruct > 0 && newSector.x === 0 && newSector.y === 0) {
    ship.destruct = 0;
    return true;
  }
  return false;
}
