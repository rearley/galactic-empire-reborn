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

// Re-export ShipKey for use in consumers that need the composite key type.
export type { ShipKey };

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
 * Fired on each successful Droid spawn. Bridged by GameGateway to the sector room.
 * Frontend uses this to add ephemeral droids to the sector roster.
 * @see GEDROIDS.C:98 droid_init
 * @see specs/019-physics-polish/data-model.md §DroidSpawnedEvent
 */
export interface DroidSpawnedEvent {
  /** Droid userid, e.g. '@Droid-7'. */
  shipId: string;
  /** Display name of the droid ship. */
  shipname: string;
  /** Ship class: 31 (Scow), 32 (Murdonian Transport), 33 (Vakory Survey Drone). */
  shpclass: number;
  sector: { x: number; y: number };
  /** Literal constant — droids are never persisted. */
  ephemeral: true;
  /** Epoch ms (Date.now()). */
  spawnedAt: number;
}

/**
 * Fired on each Droid death. Bridged by GameGateway to the sector room and
 * the global 'kills' channel so the frontend can remove the droid from its roster.
 * @see GEDROIDS.C:534 droid_died
 * @see specs/019-physics-polish/data-model.md §DroidKilledEvent
 */
export interface DroidKilledEvent {
  /** Droid userid, e.g. '@Droid-N'. */
  shipId: string;
  /** Display name of the droid ship. */
  shipname: string;
  /** Ship class: 31, 32, or 33. */
  shpclass: number;
  sector: { x: number; y: number };
  /** Attacker userid, or null for mine kills. */
  killedBy: string | null;
  /** Epoch ms (Date.now()). */
  killedAt: number;
}
