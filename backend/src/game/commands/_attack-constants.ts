/**
 * Compile-time-only constants for planet attack commands.
 * @see GECMDS.C:3515 cmd_attack
 */

/** gernd() % ITEM_DESTRUCTION_RANGE → integer in [0, 14]. @see GECMDS.C:3705–3735 */
export const ITEM_DESTRUCTION_RANGE = 15 as const;

/** Which item type is being attacked (used in call-for-help narration). */
export enum AttackKind {
  TROOP = 'troops',
  FIGHTER = 'fighters',
}
