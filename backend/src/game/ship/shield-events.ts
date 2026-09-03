/**
 * Shield charge narration.
 *
 * Raising shields does not protect you immediately: `shield += type*3` per tick
 * toward `max = 40 + type*10` (GEFUNCS.C:2510-2513), so a Mark-1 needs roughly
 * a hundred seconds to reach full. C reports every step of it —
 * `prfmsg(SHLDAT,pcnt)` each tick while charging and `prfmsg(SHLDUP)` on
 * reaching full (GEFUNCS.C:2515-2523), plus `SHLDCHP` when `shieldup` first
 * energises them (GEFUNCS.C:2413).
 *
 * The port implemented the RATE correctly and printed none of it. A pilot typed
 * `shi up`, saw "Shields up.", jumped to warp — which drops shields again — and
 * fought believing they were protected while sitting at 0%. In a playtest that
 * cost four hulls in seventy-five minutes.
 *
 * Delivered to the captain's own socket only: C uses `outprfge(FILTER,usrn)`,
 * not a sector broadcast.
 */
export const SHIP_SHIELD_CHARGE = 'ship.shield-charge' as const;

export interface ShipShieldChargeEvent {
  /** Composite key — `${userid}:${shipno}`. */
  shipId: string;
  /** 'charging' = SHLDAT with a percentage; 'full' = SHLDUP. */
  kind: 'charging' | 'full';
  /** Percentage of maximum charge, 0-100. Present for 'charging'. */
  percent: number;
}
