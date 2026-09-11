import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ge/wire';

/**
 * The types the gateway region shares.
 *
 * They lived on `game.gateway.ts` until the region was split, which left
 * `broadcast-dispatch.ts`, `ship-destroyed.service.ts` and
 * `connection-lifecycle.service.ts` type-importing back from the very file
 * they were extracted from. A module with no runtime dependencies breaks that
 * cycle: everything in the region imports types from here, and nothing here
 * imports from the region.
 */

/**
 * The Socket.io server and per-connection socket, typed with the wire
 * contract from `@ge/wire` so a wrong event name or payload shape is a
 * build error rather than a runtime surprise.
 *
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Every shape `processBroadcasts`/`emitToSockets` actually call `.emit()` on:
 * the whole server (galaxy-wide), a room operator (`server.to(room)`), or one
 * connected socket. All three carry the same `ServerToClientEvents` map.
 */
export type BroadcastTarget = GameServer | GameSocket | ReturnType<GameServer['to']>;

export interface GatewayError {
  event?: string;
  code: string;
  message: string;
}

export type OnboardingState = { step: 'AWAITING_NAME' };

/** Per-entry data stored in client.data while a multi-ship player is choosing a ship. */
export interface PendingShipSelectEntry {
  index: number;
  shipno: number;
  shpclass: number;
  shipname: string;
  xcoord: number;
  ycoord: number;
}
