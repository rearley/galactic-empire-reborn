/**
 * `useEventLog` owns the log state and every subscription that feeds it apart
 * from combat narration (`App.tsx` keeps that — it needs the player roster).
 * Same mocked-socket shape as test/useScanMap.spec.ts.
 *
 * `message.send`'s rendered format and `MAX_LOG_ENTRIES` (500, keeping the
 * newest entries) are asserted exactly as `App.tsx` produced them before this
 * move — see src/App.tsx's git history / src/hooks/useEventLog.ts.
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

import { useEventLog } from '../src/hooks/useEventLog';


describe('useEventLog', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    offCalls.length = 0;
  });

  it('starts with no lines', () => {
    const { result } = renderHook(() => useEventLog());
    expect(result.current.lines).toEqual([]);
  });

  it('renders a plain event.log line with its category', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { handlers['event.log']?.({ text: 'Self-destruct in 4 ticks!', category: 'system' }); });
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatchObject({ text: 'Self-destruct in 4 ticks!', category: 'system' });
  });

  it('defaults a missing category to system', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { handlers['event.log']?.({ text: 'no category here' }); });
    expect(result.current.lines[0]).toMatchObject({ text: 'no category here', category: 'system' });
  });

  it('renders a message.send as "[channel] from: text", category chat', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { handlers['message.send']?.({ from: 'Ranger', channel: 'A', text: 'anyone out there?' }); });
    expect(result.current.lines[0]).toMatchObject({
      text: '[A] Ranger: anyone out there?',
      category: 'chat',
    });
  });

  it('omits the channel bracket when message.send carries no channel', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { handlers['message.send']?.({ from: 'Ranger', text: 'hello' }); });
    expect(result.current.lines[0]).toMatchObject({ text: 'Ranger: hello', category: 'chat' });
  });

  it('ignores a malformed message.send', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { handlers['message.send']?.({ text: 'orphan' }); });
    expect(result.current.lines).toHaveLength(0);
  });

  it('renders sector:ship-entered and sector:ship-left as nav lines', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { handlers['sector:ship-entered']?.({ shipName: 'Ranger' }); });
    act(() => { handlers['sector:ship-left']?.({ shipName: 'Shadow' }); });
    expect(result.current.lines).toEqual([
      expect.objectContaining({ text: 'Ranger has entered the sector.', category: 'nav' }),
      expect.objectContaining({ text: 'Shadow has left the sector.', category: 'nav' }),
    ]);
  });

  it('renders cybertron.taunt and droid.annoy as combat lines', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { handlers['cybertron.taunt']?.({ message: '***\nHailing message from The Cybertron\n< Prepare to die >' }); });
    act(() => { handlers['droid.annoy']?.({ message: 'Why are you shooting at me?' }); });
    expect(result.current.lines[0]).toMatchObject({ category: 'combat' });
    expect(result.current.lines[0].text).toContain('Hailing message from The Cybertron');
    expect(result.current.lines[1]).toMatchObject({ text: 'Why are you shooting at me?', category: 'combat' });
  });

  it('ignores an AI taunt with no message', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { handlers['cybertron.taunt']?.({}); });
    expect(result.current.lines).toHaveLength(0);
  });

  it('delivers two events registered in the same effect in registration order', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => {
      handlers['message.send']?.({ from: 'A', text: 'first' });
      handlers['event.log']?.({ text: 'second' });
    });
    expect(result.current.lines.map((l) => l.text)).toEqual([
      'A: first',
      'second',
    ]);
  });

  it('caps retained lines at MAX_LOG_ENTRIES (500), keeping the newest', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => {
      for (let i = 0; i < 600; i++) {
        handlers['event.log']?.({ text: `line ${i}` });
      }
    });
    expect(result.current.lines).toHaveLength(500);
    expect(result.current.lines[0].text).toBe('line 100');
    expect(result.current.lines[499].text).toBe('line 599');
  });

  it('continues the monotonic id counter across a trim rather than resetting it', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => {
      for (let i = 0; i < 502; i++) {
        handlers['event.log']?.({ text: `line ${i}` });
      }
    });
    const ids = result.current.lines.map((l) => l.id);
    expect(ids[0]).toBe(2);
    expect(ids[499]).toBe(501);
  });

  it('append() lets a caller add lines directly, e.g. command results', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { result.current.append([{ text: 'manual', category: 'system' }]); });
    expect(result.current.lines[0]).toMatchObject({ text: 'manual', category: 'system' });
  });

  it('clear() empties the log', () => {
    const { result } = renderHook(() => useEventLog());
    act(() => { handlers['event.log']?.({ text: 'one' }); });
    act(() => { result.current.clear(); });
    expect(result.current.lines).toEqual([]);
  });

  it('unsubscribes every registered event on unmount', () => {
    const { unmount } = renderHook(() => useEventLog());
    unmount();
    const events = offCalls.map(([ev]) => ev);
    expect(events).toEqual(expect.arrayContaining([
      'sector:ship-entered',
      'sector:ship-left',
      'event.log',
      'message.send',
      'cybertron.taunt',
      'droid.annoy',
    ]));
  });
});
