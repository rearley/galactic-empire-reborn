/**
 * `useFkeys` mirrors `useScanMap`'s shape (test/useScanMap.spec.ts): a socket
 * subscription reduced to a single piece of state, extracted from `App.tsx`'s
 * `fkeys.snapshot` effect.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const handlers: Record<string, (p: unknown) => void> = {};
const offCalls: Array<[string, unknown]> = [];
vi.mock('../src/socket/socketClient', () => ({
  socket: {
    on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; },
    off: (ev: string, fn: unknown) => { offCalls.push([ev, fn]); },
  },
}));

import { useFkeys } from '../src/hooks/useFkeys';

describe('useFkeys', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    offCalls.length = 0;
  });

  it('starts empty', () => {
    const { result } = renderHook(() => useFkeys());
    expect(result.current).toEqual([]);
  });

  it('replaces the whole set on each snapshot, because the server sends the full list', () => {
    const { result } = renderHook(() => useFkeys());
    act(() => { handlers['fkeys.snapshot']?.({ fkeys: ['sca lo', 'rep'] }); });
    act(() => { handlers['fkeys.snapshot']?.({ fkeys: ['pha 75'] }); });
    expect(result.current).toEqual(['pha 75']);
  });

  it('falls back to empty when the snapshot omits fkeys', () => {
    const { result } = renderHook(() => useFkeys());
    act(() => { handlers['fkeys.snapshot']?.({ fkeys: undefined as unknown as string[] }); });
    expect(result.current).toEqual([]);
  });

  it('unsubscribes on unmount, so a second mount does not double-handle', () => {
    const { unmount } = renderHook(() => useFkeys());
    unmount();
    expect(offCalls).toContainEqual(['fkeys.snapshot', expect.any(Function)]);
  });
});
