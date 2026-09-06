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

/**
 * The phaser bank crossing a threshold the captain acts on.
 *
 *   if ((ptr->phasr < PMINFIRE) && (ptr->phasr + preload >= PMINFIRE)) prfmsg(PHSRUP);
 *   ...
 *   if (ptr->phasr >= 100) { prfmsg(PHSRMAX); ptr->phasr = 100; }
 *
 * @see GEFUNCS.C:1035-1049 checkdam
 *
 * These two lines are the feedback loop of the reload cadence — a Mark-1 fires
 * every 36 seconds, a Mark-2 every 18 — and canon's rhythm is: break off, wait
 * for "Phaser banks are at full power, Sir!", re-engage. The port recharged
 * silently, so the only way to know was to fire and see, or to poll `rep`.
 *
 * `minimum` fires on the CROSSING, not on every tick above the threshold:
 * canon tests the sum before adding it.
 */
export const SHIP_PHASER_CHARGE = 'ship.phaser-charge' as const;

export interface ShipPhaserChargeEvent {
  /** `${userid}:${shipno}` of the ship whose bank crossed the threshold. */
  shipId: string;
  /** `minimum` = PHSRUP (can fire at all); `full` = PHSRMAX (100%). */
  level: 'minimum' | 'full';
  tickAt: Date;
}

/**
 * A state transition the captain is told about but does not initiate.
 *
 *   shields-no-power  SHDNNOP  shieldstat==SHIELDUP && energy < SHMINPWR
 *                              -> shieldstat = SHIELDDN, shield = 0
 *                              @see GEFUNCS.C:1340-1348 shieldstat
 *   shields-repaired  SHREPR   a shot-out generator finishes repairing
 *                              @see GEFUNCS.C:2478-2487 shieldrep
 *   cloak-full        CLOKUP   cloak ramp 2 -> 10, i.e. FULL concealment
 *                              @see GEFUNCS.C:1717-1727 checktm
 *   cloak-repaired    CLREPR   a shot-out cloak reaches 0
 *                              @see GEFUNCS.C:1388-1394 cloakstat
 *   maint-complete    MAINT7   a paid repair finishes
 *                              @see GEFUNCS.C:422 repairship
 *   maint-interrupted MAINT10  a shot cancels a paid repair
 *                              @see GEFUNCS.C:399 repairship
 *
 * `cloak-full` is the one that most changes play: the two-tick ramp is exactly
 * the window in which a cloaking ship is still visible and still lockable, so
 * "you are now hidden" is the moment a pilot is waiting for.
 */
export const SHIP_STATUS_NOTICE = 'ship.status-notice' as const;

export type ShipStatusNotice =
  | 'shields-no-power'
  | 'shields-repaired'
  | 'cloak-full'
  | 'cloak-repaired'
  | 'maint-complete'
  | 'maint-interrupted';

export interface ShipStatusNoticeEvent {
  shipId: string;
  notice: ShipStatusNotice;
  tickAt: Date;
}
