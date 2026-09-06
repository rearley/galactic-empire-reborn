/**
 * No command result may be silently dropped.
 *
 * `useSocket` held results in a SINGLE state slot:
 *
 *   const [lastResult, setLastResult] = useState(null);
 *   onCommandResult((payload) => setLastResult(payload));
 *
 * and App reacted to `[lastResult]`. React 18 batches state updates, so two
 * `command:result` payloads arriving in the same batch collapse: the first is
 * overwritten before any effect runs and its lines never reach the log. A
 * single-slot mailbox was being used as a queue.
 *
 * Unsolicited notices (`event.log`) always appended with a functional update
 * and were never affected, which is why the loss only showed up under rapid
 * command traffic — i.e. during a fight.
 *
 * Reported from play: "I was losing some messages now that I was getting
 * attacked."
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useCommandResultQueue } from '../src/socket/useCommandResultQueue';

describe('command results are queued, never overwritten', () => {
  it('delivers BOTH results when two arrive in the same batch', () => {
    const seen: string[] = [];
    const { result } = renderHook(() =>
      useCommandResultQueue((p: { lines?: Array<{ text: string }> }) => {
        for (const l of p.lines ?? []) seen.push(l.text);
      }),
    );

    act(() => {
      result.current.push({ lines: [{ text: 'first' }] });
      result.current.push({ lines: [{ text: 'second' }] });
    });

    expect(seen).toEqual(['first', 'second']);
  });

  it('delivers a long burst in order', () => {
    const seen: string[] = [];
    const { result } = renderHook(() =>
      useCommandResultQueue((p: { lines?: Array<{ text: string }> }) => {
        for (const l of p.lines ?? []) seen.push(l.text);
      }),
    );

    act(() => {
      for (let i = 0; i < 25; i++) result.current.push({ lines: [{ text: `m${i}` }] });
    });

    expect(seen).toHaveLength(25);
    expect(seen[0]).toBe('m0');
    expect(seen[24]).toBe('m24');
  });

  it('survives two identical payloads — reference equality must not dedupe', () => {
    const seen: string[] = [];
    const same = { lines: [{ text: 'dup' }] };
    const { result } = renderHook(() =>
      useCommandResultQueue((p: { lines?: Array<{ text: string }> }) => {
        for (const l of p.lines ?? []) seen.push(l.text);
      }),
    );

    act(() => {
      result.current.push(same);
      result.current.push(same);
    });

    expect(seen).toEqual(['dup', 'dup']);
  });
});
