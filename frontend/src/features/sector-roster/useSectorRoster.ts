/**
 * React hook that listens to droid.spawned / droid.killed socket events and
 * maintains an in-memory list of ephemeral droid entries for the current sector.
 *
 * Ephemeral droids are NEVER persisted to any store — they exist only for the
 * lifetime of the socket connection and are reset on disconnect/reconnect.
 *
 * @see GEDROIDS.C:98 droid_init — spawn path
 * @see GEDROIDS.C:534 droid_died — kill path
 * @see specs/019-physics-polish/data-model.md §DroidSpawnedEvent
 */

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';

/** Ephemeral droid entry maintained in local state only. Never written to a store. */
export interface EphemeralDroidEntry {
  shipId: string;
  shipname: string;
  shpclass: number;
  sector: { x: number; y: number };
  ephemeral: true;
}

interface DroidSpawnedPayload extends EphemeralDroidEntry {
  spawnedAt: number;
}

interface DroidKilledPayload {
  shipId: string;
}

/**
 * Maintains the list of ephemeral droids visible in the current sector roster.
 *
 * @param socket - Connected socket.io client, or null if not yet connected.
 * @param currentSector - The player's current sector coordinates, or null if unknown.
 * @returns `{ droids }` — the current list of ephemeral droid entries.
 */
export function useSectorRoster(
  socket: Socket | null,
  // currentSector retained as a param for future filtering; not used for now
  // since the backend already scopes events to the correct sector room.
  _currentSector: { x: number; y: number } | null,
): { droids: EphemeralDroidEntry[] } {
  const [droids, setDroids] = useState<EphemeralDroidEntry[]>([]);

  useEffect(() => {
    if (!socket) return;

    const onSpawned = (event: DroidSpawnedPayload): void => {
      setDroids((prev) => {
        if (prev.some((d) => d.shipId === event.shipId)) return prev;
        const entry: EphemeralDroidEntry = {
          shipId: event.shipId,
          shipname: event.shipname,
          shpclass: event.shpclass,
          sector: event.sector,
          ephemeral: true,
        };
        return [...prev, entry];
      });
    };

    const onKilled = (event: DroidKilledPayload): void => {
      setDroids((prev) => prev.filter((d) => d.shipId !== event.shipId));
    };

    socket.on('droid.spawned', onSpawned);
    socket.on('droid.killed', onKilled);

    return () => {
      socket.off('droid.spawned', onSpawned);
      socket.off('droid.killed', onKilled);
    };
  }, [socket]);

  return { droids };
}
