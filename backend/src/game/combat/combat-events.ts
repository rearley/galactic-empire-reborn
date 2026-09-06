/**
 * Typed event names + payload contracts emitted by the combat module on
 * EventEmitter2. Listeners run synchronously on the tick thread; long-running
 * consumers MUST defer their work.
 *
 * @see specs/006b-combat/contracts/combat-events.md
 */

export const COMBAT_PHASER_FIRED = 'combat.phaser-fired' as const;
export interface CombatPhaserFiredEvent {
  /**
   * The firing ship's NAME, resolved by the gateway. AI are absent from the
   * client's roster, so without it the event renders as a userid — and canon
   * names an AI by its hull. @see GEFUNCS.C:2596 username
   */
  shipName?: string | null;
  shipId: string;
  bearing: number;
  percent: number;
  hyper: boolean;
  sector: { x: number; y: number };
  tickAt: Date;
}

export const COMBAT_HIT = 'combat.hit' as const;
export interface CombatHitEvent {
  attackerId: string;
  /**
   * The attacking SHIP's name — the identifier `sca sh` accepts.
   *
   * The client used to fall back to the userid half of `attackerId` for any
   * ship missing from the player roster, and the roster deliberately excludes
   * AI. So a Cybertron hit read "from Cybrg-222" while every command needed
   * "Cybrg-49340". Filled in by the gateway, which has the ship state; absent
   * if the attacker has since left the world.
   */
  attackerName?: string;
  victimId: string;
  /** The victim SHIP's name, for the same reason as `attackerName`. */
  victimName?: string;
  /**
   * `hyper-phaser` is a distinct weapon, not a phaser variant: it is the only
   * thing that can reach a ship at warp, and canon gives it its own hit lines
   * (HPHITM to the firer, HPHITU to the victim, GECMDS.C:1074-1076). Tagging a
   * hyper hit as 'phaser' told the victim the wrong weapon.
   */
  weapon: 'phaser' | 'hyper-phaser' | 'torpedo' | 'missile' | 'mine';
  damageHull: number;
  damageShield: number;
  sector: { x: number; y: number };
  tickAt: Date;
}

export const COMBAT_MISS = 'combat.miss' as const;
export interface CombatMissEvent {
  attackerId: string;
  weapon: 'phaser';
  sector: { x: number; y: number };
  tickAt: Date;
}

export const COMBAT_DECOY_INTERCEPT = 'combat.decoy-intercept' as const;
export interface CombatDecoyInterceptEvent {
  defenderId: string;
  attackerId: string;
  weapon: 'torpedo' | 'missile';
  sector: { x: number; y: number };
  tickAt: Date;
}

export const COMBAT_MINE_DETONATION = 'combat.mine-detonation' as const;
export interface CombatMineDetonationEvent {
  mineId: number;
  channel: number;
  sector: { x: number; y: number };
  tickAt: Date;
}

export const COMBAT_MINE_WARNING = 'combat.mine-warning' as const;
export interface CombatMineWarningEvent {
  mineId: number;
  victimId: string;
  sector: { x: number; y: number };
  /**
   * Signed bearing to the mine, relative to the ship's heading
   * (GEFUNCS.C:1430 `cbearing(&wptr->coord,&mptr->coord,wptr->heading)`).
   * This is the whole point of the warning — it is what lets a pilot steer off.
   */
  bearing: number;
  /** Raw distance in units, as C prints it (MINE6). */
  distance: number;
  tickAt: Date;
}

/**
 * Emitted when subsystem damage is rolled and applied during combat hit resolution.
 * @see combatTickService, applyRandamage
 */
export const COMBAT_SUBSYSTEM_DAMAGED = 'combat.subsystem-damaged' as const;
export interface CombatSubsystemDamagedEvent {
  victimId: string;
  subsystem: string;
  sector: { x: number; y: number };
  tickAt: Date;
}

export const COMBAT_SHIP_DESTROYED = 'combat.ship-destroyed' as const;
export interface CombatShipDestroyedEvent {
  victimId: string;
  attackerId: string | null;
  /** Ship key "userid:shipno" — required by CybertronTickService gold transfer (T012, FR-005a). */
  victimShipKey: string;
  /** Ship key "userid:shipno" or null — required by CybertronTickService gold transfer (T012). */
  attackerShipKey: string | null;
  /** Plain userid — allows /^Cybrg-/ regex match without parsing the ship key (T012, R-4). */
  victimUserid: string;
  /** Plain userid or null — required by gold-transfer attacker lookup (T012). */
  attackerUserid: string | null;
  attackerChannel: number;
  /**
   * `'ion'` means a planet's cannons made the kill — there is no attacking
   * ship, so `attackerId`/`attackerUserid` are null and were previously
   * indistinguishable from a self-destruct (both null, weapon null).
   * @see planet-kill.ts, GEFUNCS.C:1797 fireion
   */
  weapon: 'phaser' | 'torpedo' | 'missile' | 'mine' | 'ion' | 'gravity' | null;
  /**
   * Who or WHAT to name when no attacking SHIP resolves — the planet, for an
   * ion kill or a collision. Null for ordinary ship-vs-ship kills, where the
   * client resolves the name from `attackerId`.
   */
  attackerName?: string | null;
  sector: { x: number; y: number };
  tickAt: Date;
  /** Items looted from victim — GEFUNCS.C:killem (1122-1136). Empty when no attacker or no transfer. */
  loot: Array<{ itemIndex: number; amount: bigint }>;
  /**
   * The victim's ship name and class, for the killer's salvage report:
   * `prfmsg(KILLGOT1,ptr->shipname)` and
   * `prfmsg(KILLPNTS,gechrbuf,shipclass[ptr->shpclass].typename)`.
   * Optional because the ship is gone by the time some callers build the event.
   * @see GEFUNCS.C:1120, :1187
   */
  victimShipname?: string;
  victimClass?: number;
  /** Points awarded on this kill — shipClass.points for victim's class. 0 if class unknown. @see GEFUNCS.C:killem (1145) */
  scoreAwarded: number;
}

/**
 * A warning delivered to the ship being targeted — the half of combat canon
 * addresses to the victim rather than the attacker.
 *
 * Canon prints these with `outprfge(FILTER, ship)`, i.e. to the TARGET's
 * channel, and they are the whole reason a pilot can react:
 *
 *   lock-acquired    LOCK2   "Ship %c has a fire control scanner locked on us!"
 *                            @see GECMDS.C:1401
 *   lock-attempt     LOCK4   "Ship %c is attempting to lock fire control..."
 *                            @see GECMDS.C:1415
 *
 * The port emitted none of them, so being locked, shot at, or tracked was
 * invisible until the detonation — which left `decoy` with no trigger a player
 * could ever respond to.
 *
 * `attackerLetter` is canon's `%c`: `shpltr(ship,usrn)` renders the FIRER's
 * scan letter as the TARGET sees it, so the victim can match the warning to a
 * contact on their own scan.
 */
export const COMBAT_TARGET_WARNING = 'combat.target-warning' as const;
export interface CombatTargetWarningEvent {
  /** `${userid}:${shipno}` of the ship being warned. */
  victimId: string;
  kind:
    | 'lock-acquired'
    | 'lock-attempt'
    | 'torpedo-launched'
    | 'missile-launched'
    | 'torpedo-inbound'
    | 'missile-inbound';
  /**
   * The firer's scan letter as the victim sees it, canon's `%c`. Empty for the
   * in-flight alerts: TORP1 and MISSL1 take no argument — canon does not tell
   * you who fired the thing that is tracking you, only that it is.
   */
  attackerLetter: string;
  tickAt: Date;
}

/**
 * Blast damage from a ship destroying itself, delivered to one neighbour.
 *
 * Canon prints SELFD6 to a shielded victim and SELFD7 to an unshielded one,
 * each with the damage as a WORD via damstr, addressed to that victim alone
 * (`outprfge(ALWAYS,zothusn)`).
 *
 * @see GEFUNCS.C:1875-1892
 */
export const COMBAT_DESTRUCT_BLAST = 'combat.destruct-blast' as const;
export interface CombatDestructBlastEvent {
  /** `${userid}:${shipno}` of the ship caught in the blast. */
  victimId: string;
  damage: number;
  /** Shields up selects SELFD6 over SELFD7. */
  shieldUp: boolean;
  tickAt: Date;
}
