/**
 * Damage Control's report that a system is back online.
 *
 * Canon announces each one exactly once, on the tick its counter reaches zero:
 *
 *   if (ptr->tactical < 0) { ++ptr->tactical; if (ptr->tactical == 0) prfmsg(TAREPR); }
 *   if (ptr->helm < 0)     { ++ptr->helm;     if (ptr->helm == 0)     prfmsg(HLREPR); }
 *   if (ptr->firecntl > 0) { --ptr->firecntl; if (ptr->firecntl == 0) prfmsg(FCREPR); }
 *   if (ptr->phasr < 0)    { ++ptr->phasr;    if (ptr->phasr == 0)    prfmsg(PHREPR); }
 *
 * @see GEFUNCS.C:1016-1080 checkdam
 *
 * The port performed every recovery silently. A captain got the BROKE refusals
 * when they tried to use a downed system, but was never told when it came back
 * — the only way to find out was to keep retrying until the command stopped
 * failing.
 */
export const SHIP_SYSTEM_REPAIRED = 'ship.system-repaired' as const;

/** Which system Damage Control is reporting on. */
export type RepairedSystem = 'phaser' | 'tactical' | 'helm' | 'firecntl';

export interface ShipSystemRepairedEvent {
  /** `${userid}:${shipno}` of the ship whose system came back. */
  shipId: string;
  system: RepairedSystem;
  tickAt: Date;
}
