import { Prisma } from '../../prisma/client';
import type { ShipDeathCause, ShipDestroyedWeapon } from '../combat/combat-events';

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
  /**
   * Who `lastfired` pointed at, recorded at the moment the damage LANDED.
   *
   * In-memory only, and never persisted — it exists to survive a channel scrub
   * within a session, not a restart. `ShipStateService.leave()` has to null out
   * every `lastfired` aimed at a channel it is recycling, which used to destroy
   * the one piece of evidence the ship-loss mail needed: a killer who logged
   * off in the same tick as the kill came out as "an unknown assailant".
   * Canon carries no equivalent because it never recycles a `usrnum` densely
   * enough to need the scrub (GEFUNCS.C:1224-1225 scrubs only on death;
   * GEMAIN.C:1410-1432 warhupa scrubs nothing).
   *
   * The `channel` is kept beside the name so a reader can tell whether the name
   * still describes `lastfired`. @see attackerNameFromLastFired
   */
  lastfiredBy?: { channel: number; name: string };

  /**
   * What ended this ship, when it was not another captain. In-memory only,
   * never persisted — it lives just long enough for kill resolution to read it.
   *
   * Canon credits nobody for a collision (GEFUNCS.C:887 sets damage 101 and no
   * `lastfired`; killem's attribution is guarded on `who >= 0` at :1105), and
   * neither do we. But the port's ship-loss mail has to say SOMETHING, and
   * "an unknown assailant" invents an enemy out of a fact the server knew.
   */
  deathCause?: { kind: ShipDeathCause; what: string };

  /**
   * The weapon that last damaged this ship, so the destruction manifest can say
   * HOW a pilot died rather than `cause=unknown`.
   *
   * In-memory only, like `lastfiredBy`, and stamped beside `lastfired` at every
   * site that applies damage. Kept SEPARATE from `lastfiredBy` on purpose: a
   * mine whose owner has left the game records no name, and folding the weapon
   * into that object would lose `cause=mine` along with the attacker.
   *
   * Canon has no equivalent — `killem` reports no weapon, because on a BBS the
   * victim had just read the hit line themselves. @see issue #52
   */
  lastWeapon?: ShipDestroyedWeapon;
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
  /**
   * The class's rated top warp. Denormalised from ShipClass.maxWarp at
   * hydration so a completed repair can restore `topspeed` without
   * ShipModule having to reach into PhysicsModule.
   * @see GEFUNCS.C:420 `ptr->topspeed = shipclass[ptr->shpclass].max_warp;`
   */
  maxWarp?: number;
  warncntr: number;

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
   * Function-key command bindings, f1..f12 at indices 0..11, cached from
   * User.fkeys.
   *
   * PORT-ORIGINAL: canon kept this in the TERMINAL, not the game. Hydrated at
   * boot and at board time like `username` and `teamcode`; NOT persisted on
   * Ship — the binding belongs to the captain, not the hull, so it follows
   * them across ships. @see src/game/commands/fkeys.ts
   */
  fkeys?: string[];

  /**
   * The player's display handle, cached from User.username.
   *
   * Canon's `username()` returns `ptr->userid` for a player (GEFUNCS.C:2596),
   * and in the original that WAS the login handle. Ours is a synthetic key, so
   * the handle is carried separately and `displayName()` reads it.
   *
   * Hydrated at boot and at board time exactly as `teamcode` is; NOT persisted
   * on Ship. @see display-name.ts
   */
  username?: string;

  /**
   * Denormalised team affiliation cached from User.teamcode.
   * Hydrated at boot from User.teamcode; rewritten synchronously by the `tea`
   * command alongside the User row.
   * NOT persisted on Ship — re-derived from User.teamcode on every hydrate.
   * @see specs/012-social-commands/research.md D6
   */
  teamcode?: bigint;

  /**
   * Denormalised CUMULATIVE kill count cached from User.kills.
   *
   * `Ship.kills` (WARSHP.kills, GEMAIN.H:339) is per-hull and starts at zero on
   * every replacement. Canon's Cybertron escalation reads the USER's counter --
   * `warusroff(usrn)->kills > CYB_BE_NICE` (GECYBS.C:441) and
   * `warusroff(zothusn)->kills < CYB_BE_EASY` (:524) -- which is WARUSR.kills
   * (GEMAIN.H:298) and survives losing a ship.
   *
   * Hydrated at boot from User.kills, exactly as `teamcode` is. NOT persisted
   * on Ship; re-derived on every hydrate. Undefined for AI ships, which have no
   * User row.
   */
  userKills?: number;
}

// Ensure ShipState is compatible with Prisma's Ship shape (minus dirty).
// This compile-time check fails if the Prisma schema and ShipState diverge significantly.
type _PrismaShipFields = keyof Prisma.ShipCreateInput;
type _ShipStateFields = Exclude<keyof ShipState, 'dirty'>;
// (intentionally not exhaustive — just ensures the file compiles against the Prisma types)
export type { _PrismaShipFields, _ShipStateFields };
