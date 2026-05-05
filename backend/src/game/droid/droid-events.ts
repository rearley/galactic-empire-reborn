/**
 * Typed event names + payload contracts for droid.* events emitted via EventEmitter2.
 * GameGateway is the sole Socket.io bridge — Droid services MUST NOT call Socket.io directly.
 *
 * @see specs/008-droid-ai/contracts/droid-events.md
 * @see GEDROIDS.C — droid_annoy, droid_lives, droid_died
 */

/** Composite ship key: "userid:shipno" — mirrors ShipState identity. */
type ShipKey = string;

export const DroidEvents = {
  ANNOY: 'droid.annoy',
  SPAWNED: 'droid.spawned',
  KILLED: 'droid.killed',
} as const;

/**
 * Fired when a Droid scans an in-range player and the annoy roll succeeds,
 * or when a Droid emits a call-for-help message to its attacker.
 * @see GEDROIDS.C:237 droid_annoy — gernd()%4 == 1
 * @see specs/008-droid-ai/contracts/droid-events.md
 */
export interface DroidAnnoyEvent {
  fromShipKey: ShipKey;
  fromShipname: string;
  toUserid: string;
  toShipno: number;
  message: string;
  sector: { x: number; y: number };
  tickAt: number;
  /** 31 = Garbage Scow, 32 = Murdonian Transport, 33 = Vakory Survey Drone */
  classNumber: number;
  /** 'passive' = scan-range annoy; 'help' = fight-back call-for-help */
  variant: 'passive' | 'help';
}

/**
 * Fired on each successful Droid spawn. Operational/observability only.
 * @see GEDROIDS.C:98 droid_init
 */
export interface DroidSpawnedEvent {
  shipKey: ShipKey;
  classNumber: number;
  sector: { x: number; y: number };
  tickAt: number;
}

/**
 * Fired on each Droid death. Operational/observability only — the player-facing
 * kill notification is produced by the 006b combat.ship-destroyed chain.
 * @see GEDROIDS.C:534 droid_died
 */
export interface DroidKilledEvent {
  shipKey: ShipKey;
  classNumber: number;
  attackerShipKey: ShipKey;
  sector: { x: number; y: number };
  tickAt: number;
}
