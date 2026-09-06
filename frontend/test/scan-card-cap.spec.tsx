/**
 * The SCAN DATA card list must be bounded.
 *
 * `useScanRender` appended without any cap:
 *
 *   setCards((prev) => [...prev, event]);
 *
 * `mode` is 'overwrite' only when the player has SCANHOME on; the default is
 * 'append', so every `sca` a pilot runs adds a card that is never removed. Over
 * an evening that is hundreds of live DOM blocks, each holding a full side
 * panel, all re-rendered whenever a new one arrives — on the same thread as the
 * player's typing.
 *
 * The event log has capped at 500 since it was written; this list had no
 * equivalent. Canon has no such panel at all: it prints the scan into a
 * scrolling terminal, where old ones simply roll off.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers: Record<string, (p: unknown) => void> = {};
vi.mock('../src/socket/socketClient', () => ({
  socket: {
    on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; },
    off: () => {},
  },
}));

import { useScanRender, MAX_SCAN_CARDS } from '../src/hooks/useScanRender';

describe('useScanRender caps the card list', () => {
  beforeEach(() => { for (const k of Object.keys(handlers)) delete handlers[k]; });

  it('keeps at most MAX_SCAN_CARDS, dropping the oldest', () => {
    const { result } = renderHook(() => useScanRender());

    act(() => {
      for (let i = 0; i < MAX_SCAN_CARDS + 20; i++) {
        handlers['scan:render']?.({ kind: 'ra', mode: 'append', cells: [], header: `h${i}` });
      }
    });

    expect(result.current).toHaveLength(MAX_SCAN_CARDS);
    // Oldest dropped, newest kept.
    expect(result.current[result.current.length - 1].header).toBe(`h${MAX_SCAN_CARDS + 19}`);
  });

  it('still replaces outright when the player has SCANHOME on', () => {
    const { result } = renderHook(() => useScanRender());

    act(() => {
      handlers['scan:render']?.({ kind: 'ra', mode: 'append', cells: [], header: 'a' });
      handlers['scan:render']?.({ kind: 'ra', mode: 'overwrite', cells: [], header: 'b' });
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].header).toBe('b');
  });
});
