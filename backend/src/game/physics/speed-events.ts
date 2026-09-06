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

/**
 * The helm calling out warp factors while the engines spool.
 *
 * Canon prints WARP — "Helm reports WARP %d" — on every tick where the INTEGER
 * warp factor changes, in both directions:
 *
 *   if ((int)(ptr->speed/1000) != (int)((ptr->speed + accelrate)/1000))
 *       prfmsg(WARP,(int)((ptr->speed + accelrate)/1000));        // climbing
 *   ...
 *   if (ptr->speed > 0) prfmsg(WARP,(int)((ptr->speed-decelrate)/1000)+1);
 *   else                prfmsg(DEADSTOP);                          // slowing
 *
 * The `+1` on the way down is canon's, and it is not a rounding accident: while
 * slowing, the number announced is the factor being LEFT, not the one entered.
 *
 * Without this the only speed announcement was SPEEDIS on arrival, so ordering
 * `war 9` from a standstill gave one acknowledgement and then nine ticks of
 * silence with no sign of how far the engines had spooled.
 *
 * DEADSTOP is NOT emitted, because canon never emits it either: its branch
 * needs `speed <= 0` while `speed > speed2b`, i.e. a negative `speed2b`, and
 * canon assigns a negative speed nowhere. GEFUNCS.C:566 is the only
 * `prfmsg(DEADSTOP)` in the source. The standstill a pilot actually sees is the
 * SNAP to zero, reported by SPEED0 through SHIP_SPEED_REPORT above.
 *
 * @see GEFUNCS.C:497-500 (climb), :556-566 (slow)
 * @see GE/REL/MBMGEMSG.MSG:2160 WARP
 */
export const SHIP_WARP_PROGRESS = 'ship.warp-progress' as const;

export interface ShipWarpProgressEvent {
  shipId: string;
  userid: string;
  shipno: number;
  /** The factor canon announces — the one entered climbing, the one left slowing. */
  warp: number;
}

/**
 * The engines quitting for want of neutron flux.
 *
 *   prfmsg(NOACCEL,(int)ptr->speed);
 *   outprfge(ALWAYS,usrn);
 *   ptr->speed2b = 0;
 *
 * @see GEFUNCS.C:526-531
 *
 * `ALWAYS`, not `FILTER` — canon will not let a captain filter away the news
 * that their engines have shut down.
 *
 * NOACCEL's `%d` is `(int)ptr->speed`, the RAW speed rather than a warp factor,
 * so the shipped game prints "engine shutdown at warp 3000". That is canon's
 * own quirk; `speed` here is the raw figure and the renderer keeps it.
 *
 * The refusal comes from `useenergy`, which holds back a 500-unit reserve
 * (`if (ptr->energy >= amount+500)`, GEFUNCS.C:1505) — so acceleration cuts out
 * below 620, not below 120.
 */
export const SHIP_ENGINE_SHUTDOWN = 'ship.engine-shutdown' as const;

export interface ShipEngineShutdownEvent {
  shipId: string;
  userid: string;
  shipno: number;
  /** Raw speed units, as canon interpolates them. */
  speed: number;
}
