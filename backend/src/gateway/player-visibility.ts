import { ConnectedPlayer } from './connected-ships.registry';
import { SectorCoord, sectorVisibleTo } from '../game/ship/sector-visibility';

/** One player's position as far as a given viewer is concerned. */
export interface PlayerSectorUpdate {
  shipId: string;
  sector: SectorCoord | null;
}

/**
 * A roster as one viewer is allowed to see it.
 *
 * The panel used to receive every connected player's live sector, and
 * `physics.sector-transition` was `server.emit`-ed to every socket with the
 * mover's raw x/y — a finer position than a sector, galaxy-wide, on every
 * boundary crossing. Filtering that in the UI would leak straight back out
 * through devtools, so the gate has to sit on the wire.
 *
 * The viewer keeps everyone's NAME — the roster is the point — and gets a
 * position only for those in their own sector. @see ship/sector-visibility.ts
 */
export function scopePlayers(players: ConnectedPlayer[], viewer: SectorCoord): ConnectedPlayer[] {
  return players.map((p) => ({
    ...p,
    sector: p.sector !== null && sectorVisibleTo(viewer, p.sector) ? p.sector : null,
  }));
}

/**
 * What the MOVER must be told when they cross a boundary.
 *
 * Visibility is pairwise, so a move changes the mover's view of everyone else
 * as well as everyone else's view of the mover: the sector they left goes dark
 * and the one they entered lights up. Players who were never visible are
 * omitted rather than sent a redundant `null` — saying "still hidden" on every
 * crossing is noise, and a warping ship crosses a boundary a second.
 *
 * The mover is never in the list. Their own position is always their own; they
 * also sit in the destination room, so the arrival broadcast covers them.
 */
export function moverVisibilityUpdates(
  players: ConnectedPlayer[],
  moverShipId: string,
  from: SectorCoord,
  to: SectorCoord,
): PlayerSectorUpdate[] {
  const updates: PlayerSectorUpdate[] = [];
  for (const p of players) {
    if (p.shipId === moverShipId || p.sector === null) continue;
    if (sectorVisibleTo(to, p.sector)) updates.push({ shipId: p.shipId, sector: p.sector });
    else if (sectorVisibleTo(from, p.sector)) updates.push({ shipId: p.shipId, sector: null });
  }
  return updates;
}
