/**
 * Typed event names + payload contracts for cybertron.* events emitted via EventEmitter2.
 * GameGateway is the sole Socket.io bridge — AI services MUST NOT call Socket.io directly.
 *
 * @see specs/007-cybertron-ai/contracts/cybertron-events.md
 * @see GECYBS.C — cyb_annoy, cyb_lives, cyb_check_lockon
 */

/** Composite ship key: "userid:shipno" — mirrors ShipState identity. */
type ShipKey = string;

export const CYBERTRON_EVENT = {
  TAUNT: 'cybertron.taunt',
  SPAWNED: 'cybertron.spawned',
  TARGET_ACQUIRED: 'cybertron.target-acquired',
  BROKE_OFF: 'cybertron.broke-off',
} as const;

/**
 * Fired by cyb_annoy when a Cybertron taunts a player.
 * Gateway delivers to target's socket AND broadcasts to target's sector room.
 * @see GECYBS.C:379 cyb_annoy
 */
export interface CybertronTauntPayload {
  attackerShipKey: ShipKey;
  targetShipKey: ShipKey;
  message: string;
  /**
   * Which of the four 3.2e message bands this line came from — APPROACH,
   * BRAKE, DECLINE or ATTACK. Observability only; the gateway forwards the
   * payload wholesale. @see GECYBS.C:295, 300, 769, 782, 801
   */
  band?: 'APPROACH' | 'BRAKE' | 'DECLINE' | 'ATTACK';
  sector: { x: number; y: number };
  tickAt: number;
}

/**
 * Fired when a new Cybertron or Sartern is spawned by the spawn-fill slot.
 * Operational/observability only — not broadcast to clients.
 * @see GECYBS.C:88 cyb_init
 */
export interface CybertronSpawnedPayload {
  shipKey: ShipKey;
  classNumber: number;
  sector: { x: number; y: number };
  tickAt: number;
}

/**
 * Fired when cyb_check_lockon transitions cybmine from 255 to a valid target.
 * Operational only — player learns by being attacked.
 * @see GECYBS.C:649 cyb_check_lockon
 */
export interface CybertronTargetAcquiredPayload {
  attackerShipKey: ShipKey;
  targetShipKey: ShipKey;
  sector: { x: number; y: number };
  tickAt: number;
}

/**
 * Fired when the 1-in-CYB_BREAKOFF roll succeeds for a non-quad Cybertron.
 * Gateway delivers "lucky day" message to former target.
 * @see GECYBS.C:255 cyb_lives — CYB_BREAKOFF roll
 * @see GEMAIN.H CYB_BREAKOFF=500
 */
export interface CybertronBrokeOffPayload {
  attackerShipKey: ShipKey;
  targetShipKey: ShipKey;
  sector: { x: number; y: number };
  tickAt: number;
}
