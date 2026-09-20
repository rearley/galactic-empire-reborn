/**
 * `useDeployNotice` — the state behind the redeploy banner.
 *
 * Exists because a log line was not enough. The first production deploy to
 * warn anyone reached two players; one saw it and one did not, because the log
 * scrolls and they were not watching it. The banner sits outside the log and
 * counts down, so a glance at any moment answers "how long have I got".
 *
 * Same mocked-socket shape as test/useEventLog.spec.ts.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const handlers: Record<string, (p: unknown) => void> = {};
vi.mock('../src/socket/socketClient', () => ({
  socket: {
    on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; },
    off: (ev: string) => { delete handlers[ev]; },
  },
}));

import { useDeployNotice } from '../src/hooks/useDeployNotice';

const imminent = { phase: 'imminent', text: 'Refit in 45 seconds, Sir.', seconds: 45 };
const inbound = { phase: 'inbound', text: 'Carrier wave, Sir.', seconds: 0 };

describe('useDeployNotice', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('is silent until the server says otherwise', () => {
    const { result } = renderHook(() => useDeployNotice());
    expect(result.current).toBeNull();
  });

  it('carries the server\'s words, never its own', () => {
    const { result } = renderHook(() => useDeployNotice());
    act(() => { handlers['deploy.notice'](imminent); });
    expect(result.current?.text).toBe('Refit in 45 seconds, Sir.');
    expect(result.current?.phase).toBe('imminent');
  });

  it('ticks the countdown down in real time', () => {
    const { result } = renderHook(() => useDeployNotice());
    act(() => { handlers['deploy.notice'](imminent); });
    expect(result.current?.secondsLeft).toBe(45);

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current?.secondsLeft).toBe(35);

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current?.secondsLeft).toBe(5);
  });

  it('STOPS AT ZERO rather than counting into negative numbers', () => {
    // The stop can be late - the hook sleeps 45s but the container still has to
    // be stopped - and a banner reading "-12" would be the last thing a player
    // saw. Zero means "any moment now", which stays true however late it is.
    const { result } = renderHook(() => useDeployNotice());
    act(() => { handlers['deploy.notice'](imminent); });

    act(() => { vi.advanceTimersByTime(90_000); });

    expect(result.current?.secondsLeft).toBe(0);
  });

  it('shows no timer for a phase with no honest number', () => {
    // `inbound` is a 5-10 minute range: CI cannot know when watchtower pulls.
    const { result } = renderHook(() => useDeployNotice());
    act(() => { handlers['deploy.notice'](inbound); });
    expect(result.current?.secondsLeft).toBeNull();
    expect(result.current?.text).toBe('Carrier wave, Sir.');
  });

  it('lets the imminent notice replace the inbound one', () => {
    const { result } = renderHook(() => useDeployNotice());
    act(() => { handlers['deploy.notice'](inbound); });
    act(() => { handlers['deploy.notice'](imminent); });
    expect(result.current?.phase).toBe('imminent');
    expect(result.current?.secondsLeft).toBe(45);
  });

  it('clears itself once the server is back', () => {
    // The restart is what the notice was about. Leaving it up afterwards would
    // warn about something that has already happened.
    const { result } = renderHook(() => useDeployNotice());
    act(() => { handlers['deploy.notice'](imminent); });
    expect(result.current).not.toBeNull();

    act(() => { handlers['connect'](undefined); });

    expect(result.current).toBeNull();
  });

  it('can be dismissed by the player', () => {
    const { result } = renderHook(() => useDeployNotice());
    act(() => { handlers['deploy.notice'](imminent); });
    act(() => { result.current?.dismiss(); });
    expect(result.current).toBeNull();
  });
});
