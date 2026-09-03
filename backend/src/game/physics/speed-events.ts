/**
 * The helm answering the throttle.
 *
 * `accel()` reports every time the ship actually REACHES the speed it was
 * ordered to, in both directions: `prfmsg(SPEEDIS, showarp(ptr->speed))` on the
 * accelerate snap (GEFUNCS.C:487-489) and again on the decelerate snap, or
 * `prfmsg(SPEED0)` if that snap landed on a dead stop
 * (GEFUNCS.C:543-553). Both go out `outprfge(FILTER, usrn)` — the captain's own
 * socket, not the sector.
 *
 * The port acknowledged the ORDER ("Accelerating to warp 5") and never the
 * arrival, so there was no way to know when the ship was actually at warp
 * short of polling `rep nav`.
 *
 * ON THE WORDING: SPEEDIS is "Helm reports speed is now warp %d point %d, Sir!"
 * — two integer slots — but canon passes it `showarp()`, which returns a STRING
 * ("5.00"). That is a varargs bug: the shipped game printed garbage here. We
 * keep the sentence and feed it the two numbers it plainly wants, with the
 * fraction zero-padded the way showarp's own "%.2f" formats it.
 *
 * @see GEFUNCS.C:478-553 accel, GEFUNCS.C:2674-2685 showarp
 * @see MBMGEMSG.MSG SPEEDIS, SPEED0
 */
export const SHIP_SPEED_REPORT = 'ship.speed-report' as const;

export interface ShipSpeedReportEvent {
  /** Composite key — `${userid}:${shipno}`. */
  shipId: string;
  userid: string;
  shipno: number;
  /** Raw speed units; 1000 per warp factor. */
  speed: number;
}

/**
 * A warp boundary crossing shook off every missile locked onto the ship.
 *
 * Inside accel's non-snap accelerate branch, once the energy debit succeeds and
 * only when the ship crosses an integer warp boundary, canon rolls a threshold
 * of `4 + gernd()%4` and, if the new warp meets it, zeroes every tracked
 * missile and prints MISSL2 — `outprfge(FILTER, usrn)`, the captain's own
 * socket. The threshold is redrawn on every crossing, so warp 4 shakes a
 * missile a quarter of the time and warp 7 always.
 *
 * This is the counter to guided weapons, and none of it was implemented.
 *
 * @see GEFUNCS.C:497-521, GE/REL/MBMGEMSG.MSG:2630 MISSL2
 */
export const SHIP_MISSILE_SHAKEN = 'ship.missile-shaken' as const;

export interface ShipMissileShakenEvent {
  shipId: string;
  userid: string;
  shipno: number;
  /** How many locked missiles self-destructed. */
  count: number;
}
