/**
 * Types for planet attack resolution — shared between PlanetAttackService and AttackHandler.
 * @see GECMDS.C:3515 cmd_attack
 */

export { AttackKind } from '../commands/_attack-constants';

/** Combat outcome returned by attackTroop / attackFighter. */
export interface AttackOutcome {
  /** Surviving attacker units (troops or fighters). */
  left1: number;
  /** Surviving defender units (troops or fighters). */
  left2: number;
  /** Attacker losses. */
  kill1: number;
  /** Defender losses. */
  kill2: number;
  /** 1 if attacker won; 0 otherwise. */
  won: number;
  /** Items destroyed during the high-ratio destruction pass. */
  itemsDestroyed: Array<{ itemIndex: number; destroyed: number }>;
  /** Narration lines to emit to the attacker (in order). */
  narration: string[];
}
