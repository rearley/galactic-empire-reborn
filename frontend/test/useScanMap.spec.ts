/**
 * The sector map belongs to the hull that drew it, for the same reason the
 * SCAN DATA cards do (test/scan-resets-on-ship-change.spec.tsx). This is the
 * same hook shape, applied to App's "latest grid" half of `scan:render`
 * rather than useScanRender's card history.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers: Record<string, (p: unknown) => void> = {};
const offCalls: Array<[string, unknown]> = [];
vi.mock('../src/socket/socketClient', () => ({
  socket: {
    on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; },
    off: (ev: string, fn: unknown) => { offCalls.push([ev, fn]); },
  },
}));

import { useScanMap } from '../src/hooks/useScanMap';

describe('useScanMap', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    offCalls.length = 0;
  });

  it('starts with no grid', () => {
    const { result } = renderHook(() => useScanMap('rick:1'));
    expect(result.current.cells).toBeNull();
    expect(result.current.kind).toBeNull();
  });

  it('keeps only the latest grid, replacing the previous one', () => {
    const { result } = renderHook(() => useScanMap('rick:1'));
    act(() => {
      handlers['scan:render']?.({ kind: 'lo', cells: [{ x: 1, y: 1, type: 'self', char: '*' }] });
    });
    act(() => {
      handlers['scan:render']?.({ kind: 'se', cells: [{ x: 2, y: 2, type: 'planet', char: '3' }] });
    });
    expect(result.current.kind).toBe('se');
    expect(result.current.cells).toHaveLength(1);
    expect(result.current.cells?.[0].x).toBe(2);
  });

  it('discards the grid when the hull changes, because the map belongs to the hull that drew it', () => {
    const { result, rerender } = renderHook(({ id }) => useScanMap(id), {
      initialProps: { id: 'rick:1' },
    });
    act(() => {
      handlers['scan:render']?.({ kind: 'lo', cells: [{ x: 1, y: 1, type: 'self', char: '*' }] });
    });
    rerender({ id: 'rick:2' });
    expect(result.current.cells).toBeNull();
    expect(result.current.kind).toBeNull();
  });

  it('unsubscribes on unmount, so a second mount does not double-handle', () => {
    const { unmount } = renderHook(() => useScanMap('rick:1'));
    unmount();
    expect(offCalls).toContainEqual(['scan:render', expect.any(Function)]);
  });
});
