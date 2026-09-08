/**
 * What the client should say about a ship being destroyed — which is now
 * almost nothing, because the server says it in canon's own words.
 *
 * The client used to compose every destruction line itself. That predates the
 * server learning canon's announcements, and once those landed the client's
 * lines became duplicates of them:
 *
 *   • a kill by another ship → `KILLEDBY`, galaxy-wide (GEFUNCS.C:1116)
 *   • a death with no killer → `DIED`, galaxy-wide (GEFUNCS.C:1263)
 *   • the pilot who died     → `YOURDEAD`, to them alone (GEFUNCS.C:978)
 *
 * Worse than duplicating, the client's fallback named the victim by
 * `victimUserid`, so an AI death printed the internal `Cybrg-NNN` account —
 * the name canon's `username()` exists to keep off the screen. Reported from
 * play: "Cybrg-222 has been destroyed!".
 *
 * ONE case survives, and it is a deliberate deviation rather than an oversight:
 * a colony's ion cannons take canon's killer-less branch, so `DIED` announces
 * the death without saying what caused it. Naming the planet is the only way a
 * defender learns their own colony did the work.
 */
export interface DestructionEvent {
  weapon: string | null;
  attackerId: string | null;
  attackerName?: string | null;
}

export function destructionLine(
  event: DestructionEvent,
  victimName: string,
): string | null {
  if (event.weapon !== 'ion' || event.attackerId !== null) return null;
  return `${victimName} was destroyed by ${event.attackerName ?? 'planetary defences'}.`;
}
