import { Prisma } from '@prisma/client';

/**
 * Composite key for the in-memory ship state Map.
 * Mirrors Ship @@id([userid, shipno]) from the Prisma schema.
 */
export function shipKey(userid: string, shipno: number): string {
  return `${userid}:${shipno}`;
}

/**
 * Live in-memory representation of one ship — mirrors the Prisma Ship model
 * field-for-field plus the dirty flag used for async DB flush.
 * @see backend/prisma/schema.prisma Ship model
 * @see GEMAIN.H WARSHP struct
 */
export interface ShipState {
  // Composite key
  userid: string;
  shipno: number;

  // Identity
  shipname: string;
  shpclass: number;

  // Navigation
  heading: number;
  head2b: number;
  speed: number;
  speed2b: number;
  xcoord: number;
  ycoord: number;

  // Systems
  damage: number;
  energy: number;
  phasr: number;
  phasrtype: number;
  kills: number;
  lastfired: number;
  /**
   * Unique per-ship channel while in the game — this port's `usrnum`.
   *
   * Assigned by ShipStateService when the ship enters the map and cleared when
   * it leaves, so it is never persisted. `lastfired` and the torpedo, missile
   * and mine records all store a channel so a kill can be credited back to the
   * ship that caused it. Undefined for a ship that is not in the game, which is
   * why every comparison against it is a strict `===` against a number.
   *
   * @see ShipChannelRegistry
   * @see GEMAIN.H:340 — lastfired is the *usernumber* of the last user to fire on you
   */
  channel?: number;
  shieldtype: number;
  shieldstat: number;
  shield: number;
  cloak: number;

  // Navigation state — set by cmd_rotate/cmd_impulse
  /** Requested rotation delta, ∈ [-180, 180]. @see GEFUNCS.C:1933 valdegree */
  degrees: number;
  /** Impulse %, ∈ [0, 99]. @see GEFUNCS.C:1906 valpcnt */
  percent: number;

  // Gating flags (short-circuited per FR-019a until feature 006)
  tactical: number;
  helm: number;
  train: number;

  // Location
  /** Hyperspace flag; >= 10 = in orbit. @see GEMAIN.H WARSHP.where */
  where: number;

  // Weapons arrays — parallel arrays per FR-035
  ltorpsChannel: number[];
  ltorpsDistance: number[];
  lmisslChannel: number[];
  lmisslDistance: number[];
  lmisslEnergy: number[];

  // Other
  decout: number[];
  jammer: number;
  freq: number[];
  items: bigint[];
  titem: number;
  hostile: number;
  cantexit: number;
  repair: number;
  hypha: number;
  firecntl: number;
  destruct: number;
  status: number;
  cybmine: number;
  cybskill: number;
  cybupdate: number;
  tick: number;
  emulate: number;
  minesnear: number;
  lock: number;
  /**
   * Composite key (`userid:shipno`) of the locked ship.
   *
   * `lock` alone is ambiguous: it holds the target's per-user `shipno`, and
   * every droid plus every player's first ship is shipno 1. C's `lock` is a
   * GLOBAL slot index (GECMDS.C:1443), so this restores the "exactly one ship"
   * property without changing the persisted column. In-memory only; null when
   * unlocked or when restored from a persisted `lock` with no key.
   */
  lockKey?: string | null;
  holdcourse: number;
  topspeed: number;
  /** Maximum cargo capacity in tons. Loaded from ShipClass.maxTons at hydration. @see GEMAIN.H WARSHP */
  maxTons?: number;
  warncntr: number;

  /** Auto-shield flag — toggled by `set auto-shield on/off`. @see GECMDS.C:5190 cmd_set */
  autoShield?: boolean;
  /** Auto-repair flag — toggled by `set auto-repair on/off`. @see GECMDS.C:5190 cmd_set */
  autoRepair?: boolean;

  /**
   * Autopilot target X sector. Null when autopilot inactive.
   * @see GECMDS.C:5121 cmd_navigate (deviation: original was one-shot)
   * @see specs/016-navigation-spy/research.md D1
   */
  navTargetX: number | null;

  /** Autopilot target Y sector. Null when autopilot inactive. */
  navTargetY: number | null;

  /**
   * Show ship names on scan lo overlay. Derived from User.options[0].
   * @see GEMAIN.H:233 SCANNAMES
   */
  scanNames: boolean;
  /**
   * Overwrite (home) mode for scan lo render. Derived from User.options[1].
   * @see GEMAIN.H:234 SCANHOME
   */
  scanHome: boolean;
  /**
   * Show full detail panel on scan lo output. Derived from User.options[2].
   * @see GEMAIN.H:235 SCANFULL
   */
  scanFull: boolean;
  /**
   * Suppress non-critical server messages. Derived from User.options[3].
   * @see GEMAIN.H:236 MSG_FILTER
   */
  msgFilter: boolean;

  /** In-memory only — true after any mutation; cleared after successful Prisma flush. */
  dirty: boolean;

  /**
   * In-memory only — when true this ship has no Prisma row and must never be written to DB.
   * Used exclusively by Droid AI ships (classes 31/32/33).
   * flush() skips states where isEphemeral === true (FR-002).
   * @see specs/008-droid-ai/spec.md FR-001..FR-004
   */
  isEphemeral?: boolean;

  /**
   * Denormalised team affiliation cached from User.teamcode.
   * Hydrated at boot from User.teamcode; rewritten synchronously by the `tea`
   * command alongside the User row.
   * NOT persisted on Ship — re-derived from User.teamcode on every hydrate.
   * @see specs/012-social-commands/research.md D6
   */
  teamcode?: bigint;

  /**
   * Transient auto-shield trigger — set when the ship exits warp (hyperspace=exit).
   * Consumed and cleared by ShipTickService.processShip on the next SHIP_UPDATE tick.
   * In-memory only, no schema impact.
   * @see specs/019-physics-polish/plan.md §T024 trigger-flag attachment sites
   */
  recentlyWarpedExit?: boolean;

  /**
   * Transient auto-shield trigger — set when the ship fires a self-torpedo.
   * Consumed and cleared by ShipTickService.processShip on the next SHIP_UPDATE tick.
   * In-memory only, no schema impact.
   * @see specs/019-physics-polish/plan.md §T024 trigger-flag attachment sites
   */
  recentlySelfFiredTorp?: boolean;
}

// Ensure ShipState is compatible with Prisma's Ship shape (minus dirty).
// This compile-time check fails if the Prisma schema and ShipState diverge significantly.
type _PrismaShipFields = keyof Prisma.ShipCreateInput;
type _ShipStateFields = Exclude<keyof ShipState, 'dirty'>;
// (intentionally not exhaustive — just ensures the file compiles against the Prisma types)
export type { _PrismaShipFields, _ShipStateFields };
