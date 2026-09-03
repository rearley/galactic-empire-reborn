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
