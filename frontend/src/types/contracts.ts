/**
 * Wire types for backend GameGateway ↔ React frontend communication.
 *
 * Pre-existing types (EventLogCategory, EventLogLine, ScanCell, CommandRequest,
 * CommandResultPayload) mirror specs/003-ship-commands/contracts/shared-types.ts —
 * structural parity is enforced by frontend/test/contracts-parity.spec.ts.
 *
 * New 010-era types (Sector, ConnectedPlayer, PlayerSnapshotPayload,
 * PlayerJoinedPayload, PlayerLeftPayload, SectorTransition,
 * PhysicsSectorTransitionPayload) are canonical here — no external file to sync to.
 */

/**
 * Shared wire types between backend GameGateway and the React frontend.
 *
 * This file is the canonical contract. The frontend duplicates these declarations into
 * `frontend/src/types/contracts.ts`; both copies must remain identical. A TS-level
 * structural check in `frontend/test/contracts-parity.spec.ts` (added under feature 003)
 * fails the frontend test suite if the two diverge.
 *
 * @see specs/003-ship-commands/contracts/websocket-events.md
 */

export type EventLogCategory = 'system' | 'info' | 'success' | 'combat';

export interface EventLogLine {
  text: string;
  category: EventLogCategory;
}

/**
 * Object class for a `scanGrid` cell.
 *
 * `'self'` is the connecting player's own ship at the geometric centre of the
 * range-scan map (`map[MAXY/2][MAXX/2] = '*'` per `GECMDS.C:2721`). The
 * backend includes the self-cell so the wire payload is self-describing — the
 * frontend renders it like any other cell, no client-side overlay logic.
 *
 * @see specs/003-ship-commands/spec.md `Clarifications` 2026-05-02 Q2
 */
export type ScanCellType = 'ship' | 'planet' | 'wormhole' | 'self';

/**
 * Range-scan grid dimensions, taken verbatim from the original game.
 *
 * Source: `reference/ge-source/GEMAIN.H` lines 121-122 — `#define MAXX 30`,
 * `#define MAXY 15`. The `scan_lo` renderer at `GECMDS.C:2640-2726` declares
 * `map[MAXY][MAXX]` and centres the player at `map[MAXY/2][MAXX/2]`.
 *
 * The frontend MUST read these constants from this module rather than
 * hard-coding 30/15 — if the original ever needed to be revisited, this file
 * is the single source of truth and the backend ship-coord-to-cell projection
 * and the frontend grid render must move together.
 *
 * @see GEMAIN.H:121
 * @see GEMAIN.H:122
 * @see GECMDS.C:2681 (xfactor / yfactor projection)
 * @see GECMDS.C:2721 (player-centre placement)
 */
export const SCAN_GRID_WIDTH = 30 as const;
export const SCAN_GRID_HEIGHT = 15 as const;

export interface ScanCell {
  /** integer 0..SCAN_GRID_WIDTH-1, range-scan column */
  x: number;
  /** integer 0..SCAN_GRID_HEIGHT-1, range-scan row */
  y: number;
  type: ScanCellType;
  /**
   * The original game's single-ASCII character for this object.
   * `'self'` cells carry `'*'` per `GECMDS.C:2721`. See data-model.md.
   */
  char: string;
}

// ─── T003: Player presence & sector-transition wire types ────────────────────

/** Integer sector coordinates — 0..MAXX-1 (x), 0..MAXY-1 (y). */
export interface Sector {
  x: number;
  y: number;
}

/** A connected player visible to other players in the galaxy. */
export interface ConnectedPlayer {
  shipId: string;
  name: string;
  sector: Sector;
  shipClass: number;
}

/** Outbound: server → client `player.snapshot` — full list on join. */
export interface PlayerSnapshotPayload {
  players: ConnectedPlayer[];
}

/** Outbound: server → client `player.joined` — new player connected. */
export type PlayerJoinedPayload = ConnectedPlayer;

/** Outbound: server → client `player.left` — player disconnected. */
export interface PlayerLeftPayload {
  shipId: string;
}

/** A single ship's sector transition within one physics tick. */
export interface SectorTransition {
  shipId: string;
  fromSector: Sector;
  toSector: Sector;
}

/** Outbound: server → client `physics.sector-transition` — tick movement. */
export interface PhysicsSectorTransitionPayload {
  transitions: SectorTransition[];
}

// ─── T005: Typed event-name constants ────────────────────────────────────────

export const PLAYER_SNAPSHOT = 'player.snapshot' as const;
export const PLAYER_JOINED = 'player.joined' as const;
export const PLAYER_LEFT = 'player.left' as const;
export const PHYSICS_SECTOR_TRANSITION = 'physics.sector-transition' as const;

/** Outbound: server → client `ship.renamed` — a player renamed their ship. */
export interface ShipRenamedPayload {
  shipId: string;
  oldName: string;
  newName: string;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Inbound: client → server `command` */
export interface CommandRequest {
  input: string;
}

/** Outbound: server → client `command:result` */
export interface CommandResultPayload {
  lines: EventLogLine[];
  /** present only when the command was `scan` (or an alias) */
  scanGrid?: ScanCell[];
  /** When true, the frontend should clear the event log. Used by the `cls` command.
   * @see specs/016-navigation-spy/research.md D4 */
  clearLog?: boolean;
}
