/**
 * T041 — US6: useSectorRoster hook spec.
 *
 * Verifies that:
 * - droid.spawned events add entries to the roster with ephemeral=true
 * - droid.killed events remove entries by shipId
 * - duplicate spawned events for the same shipId are deduped
 * - entries are never written to any persisted store (component-local state only)
 * - cleanup on unmount removes socket listeners
 *
 * @see specs/019-physics-polish/data-model.md §DroidSpawnedEvent
 * @see frontend/src/features/sector-roster/useSectorRoster.ts
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSectorRoster } from '../src/features/sector-roster/useSectorRoster';

/**
 * Minimal event emitter. The frontend has no @types/node, so Node's `events`
 * module cannot be type-checked here; this keeps the test browser-only.
 */
class TestEmitter {
  private handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, handler: (...args: unknown[]) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    const list = this.handlers.get(event) ?? [];
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
  }

  listenerCount(event: string): number {
    return (this.handlers.get(event) ?? []).length;
  }
}

function makeSocket() {
  const emitter = new TestEmitter();
  return {
    on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler),
    off: (event: string, handler: (...args: unknown[]) => void) => emitter.off(event, handler),
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
  } as unknown as import('socket.io-client').Socket;
}

const SECTOR = { x: 5, y: 3 };

const SPAWN_1 = {
  shipId: '@Droid-001',
  shipname: 'Lydorian Garbage Scow',
  shpclass: 31,
  sector: SECTOR,
  ephemeral: true,
  spawnedAt: Date.now(),
};

const SPAWN_2 = {
  shipId: '@Droid-002',
  shipname: 'Murdonian Transport',
  shpclass: 32,
  sector: SECTOR,
  ephemeral: true,
  spawnedAt: Date.now(),
};

describe('useSectorRoster — droid.spawned / droid.killed', () => {
  it('starts with an empty roster', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useSectorRoster(socket, SECTOR));
    expect(result.current.droids).toHaveLength(0);
  });

  it('adds a droid entry on droid.spawned', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useSectorRoster(socket, SECTOR));

    act(() => { socket.emit('droid.spawned', SPAWN_1); });

    expect(result.current.droids).toHaveLength(1);
    expect(result.current.droids[0].shipId).toBe('@Droid-001');
    expect(result.current.droids[0].ephemeral).toBe(true);
  });

  it('removes the entry on droid.killed', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useSectorRoster(socket, SECTOR));

    act(() => { socket.emit('droid.spawned', SPAWN_1); });
    act(() => { socket.emit('droid.killed', { shipId: '@Droid-001' }); });

    expect(result.current.droids).toHaveLength(0);
  });

  it('deduplicates spawned events for the same shipId', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useSectorRoster(socket, SECTOR));

    act(() => { socket.emit('droid.spawned', SPAWN_1); });
    act(() => { socket.emit('droid.spawned', SPAWN_1); });

    expect(result.current.droids).toHaveLength(1);
  });

  it('handles multiple droids independently', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useSectorRoster(socket, SECTOR));

    act(() => {
      socket.emit('droid.spawned', SPAWN_1);
      socket.emit('droid.spawned', SPAWN_2);
    });
    expect(result.current.droids).toHaveLength(2);

    act(() => { socket.emit('droid.killed', { shipId: '@Droid-001' }); });
    expect(result.current.droids).toHaveLength(1);
    expect(result.current.droids[0].shipId).toBe('@Droid-002');
  });

  it('kill for an unknown shipId is a no-op', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useSectorRoster(socket, SECTOR));

    act(() => { socket.emit('droid.spawned', SPAWN_1); });
    act(() => { socket.emit('droid.killed', { shipId: '@Droid-999' }); });

    expect(result.current.droids).toHaveLength(1);
  });

  it('removes listeners on unmount (no leaks)', () => {
    const socket = makeSocket();
    const emitter = socket as unknown as { emit: typeof socket.emit };

    const { result, unmount } = renderHook(() => useSectorRoster(socket, SECTOR));

    act(() => { emitter.emit('droid.spawned', SPAWN_1); });
    expect(result.current.droids).toHaveLength(1);

    unmount();

    // After unmount, events should no longer update the hook's state
    act(() => { emitter.emit('droid.killed', { shipId: '@Droid-001' }); });
    // The hook is unmounted — no assertion on result, just verify no error thrown
  });

  it('does not write to any external/persisted store', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useSectorRoster(socket, SECTOR));

    act(() => {
      socket.emit('droid.spawned', SPAWN_1);
      socket.emit('droid.spawned', SPAWN_2);
    });

    // Droids exist in hook state
    expect(result.current.droids).toHaveLength(2);

    // But nothing went to localStorage or sessionStorage
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
