/**
 * Typed event names + payload contracts emitted by the combat module on
 * EventEmitter2. Listeners run synchronously on the tick thread; long-running
 * consumers MUST defer their work.
 *
 * @see specs/006b-combat/contracts/combat-events.md
 */

export const COMBAT_PHASER_FIRED = 'combat.phaser-fired' as const;
export interface CombatPhaserFiredEvent {
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
  weapon: 'phaser' | 'torpedo' | 'missile' | 'mine';
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
  weapon: 'phaser' | 'torpedo' | 'missile' | 'mine' | null;
  sector: { x: number; y: number };
  tickAt: Date;
  /** Items looted from victim — GEFUNCS.C:killem (1122-1136). Empty when no attacker or no transfer. */
  loot: Array<{ itemIndex: number; amount: bigint }>;
  /** Points awarded on this kill — shipClass.points for victim's class. 0 if class unknown. @see GEFUNCS.C:killem (1145) */
  scoreAwarded: number;
}
