/**
 * Scan data belongs to the SHIP that gathered it.
 *
 * The backend keys its scantab `userid#shipno` (scan.handler getScantab), so a
 * hull you have just boarded genuinely starts blind. The FRONTEND kept both
 * displays across a switch: the SCAN DATA cards and the sector map stayed on
 * screen, so a captain stepping out of a Stealth Fighter (200,000 scan range)
 * into an Interceptor (100,000) still saw the longer-ranged picture — contacts
 * their current hull cannot detect, rendered as if current.
 *
 * Reported from play: "when I come in one ship and switch to another, the scan
 * history stays meaning I can 'see' the longer ranges, even if in the past."
 *
 * Stale scan data is worse than none: it is indistinguishable from a live
 * reading, and every scan mode in this game is explicitly range-limited by hull.
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

import { useScanRender } from '../src/hooks/useScanRender';

describe('scan display resets when the captain changes ship', () => {
  beforeEach(() => { for (const k of Object.keys(handlers)) delete handlers[k]; });

  it('drops cards gathered by the previous hull', () => {
    const { result, rerender } = renderHook(({ id }) => useScanRender(id), {
      initialProps: { id: 'u1:3' },
    });

    act(() => {
      handlers['scan:render']?.({ kind: 'ra', mode: 'append', cells: [], header: 'from the Stealth' });
    });
    expect(result.current).toHaveLength(1);

    rerender({ id: 'u1:1' });          // stepped into the Interceptor

    expect(result.current).toHaveLength(0);
  });

  it('keeps them while the captain stays in the same hull', () => {
    const { result, rerender } = renderHook(({ id }) => useScanRender(id), {
      initialProps: { id: 'u1:3' },
    });

    act(() => {
      handlers['scan:render']?.({ kind: 'ra', mode: 'append', cells: [], header: 'a' });
    });
    rerender({ id: 'u1:3' });

    expect(result.current).toHaveLength(1);
  });
});
