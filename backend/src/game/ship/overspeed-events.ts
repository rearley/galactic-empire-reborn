/**
 * Overspeed warnings — the escalating notice a pilot gets for running past
 * their hull's rated warp, and the break when they ignore it.
 *
 *   if (ptr->warncntr > 4) { prfmsg(WARPBRK); ptr->topspeed = 0; ... }
 *   else { prfmsg(WARPFAST + ptr->warncntr); ptr->warncntr++; }
 *   — GEFUNCS.C:748-765
 *
 * `WARPFAST + warncntr` indexes consecutive message ids, so each rung of the
 * ladder reads differently and the pilot can tell how much rope is left. The
 * tick implemented the ladder but dropped every message behind a stale TODO,
 * so the first sign of trouble was a dead warp drive.
 */

export const SHIP_OVERSPEED = 'ship.overspeed' as const;

export interface ShipOverspeedEvent {
  /** `${userid}:${shipno}` — routed to that captain alone. */
  shipId: string;
  kind: 'warn' | 'break';
  text: string;
}

/** WARPFAST..WARPFAST+4 — one line per consecutive warning. */
export const WARN_LADDER: readonly string[] = Object.freeze([
  'Your engines are straining above their rated warp.',
  'WARNING: engine temperature climbing — reduce speed.',
  'WARNING: the drive is shuddering badly. Reduce speed NOW.',
  'DANGER: engine housing is failing at this speed.',
  'DANGER: the warp drive is about to tear itself apart.',
]);

/** WARPBRK. */
export const BREAK_MESSAGE =
  'Your warp drive has blown. Engines are offline and the hull is damaged.';

export function overspeedMessage(kind: 'warn' | 'break', warncntr: number): string {
  if (kind === 'break') return BREAK_MESSAGE;
  const i = Math.min(Math.max(warncntr, 0), WARN_LADDER.length - 1);
  return WARN_LADDER[i];
}
