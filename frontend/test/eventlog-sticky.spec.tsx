/**
 * Auto-scroll must survive a nudge, and must be recoverable when it doesn't.
 *
 * STICKY_THRESHOLD was 8px against a ~20px line height, so drifting a single
 * line off the bottom — a trackpad nudge, a click that shifts scroll a few
 * pixels, or the container growing between the scroll write and the scroll
 * event during a burst — disengaged auto-scroll for good. Nothing indicated it
 * had happened and nothing brought it back but scrolling to within 8px of the
 * bottom by hand.
 *
 * Reported from play: "in the middle of a battle I had to click in the event
 * log and scroll to see what happened next."
 *
 * Two changes: a tolerance measured in LINES rather than pixels, and a visible
 * "jump to latest" control whenever the log is not following, so the state is
 * legible and one click undoes it.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EventLog } from '../src/components/EventLog';
import type { LogEntry } from '../src/types/logEntry';

const nextFrame = () =>
  act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });

function mount() {
  const lines: LogEntry[] = [{ text: 'line 0', category: 'info', id: 0 }];
  const view = render(<EventLog lines={lines} />);
  const el = screen.getByTestId('event-log');
  Object.defineProperty(el, 'scrollHeight', { value: 1000, writable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, writable: true });
  return { ...view, el, lines };
}

const setScroll = (el: HTMLElement, top: number) => {
  Object.defineProperty(el, 'scrollTop', { value: top, writable: true });
  fireEvent.scroll(el);
};

describe('EventLog sticky-bottom tolerance', () => {
  it('keeps following after a nudge of a couple of lines', async () => {
    const { el, rerender, lines } = mount();

    // 40px off the bottom — two lines. Bottom is scrollTop 600.
    setScroll(el, 560);
    rerender(<EventLog lines={[...lines, { text: 'new', category: 'info', id: 1 }]} />);
    await nextFrame();

    expect(el.scrollTop).toBe(1000);
  });

  it('stops following when the reader scrolls genuinely up', async () => {
    const { el, rerender, lines } = mount();

    setScroll(el, 100);
    rerender(<EventLog lines={[...lines, { text: 'new', category: 'info', id: 1 }]} />);
    await nextFrame();

    expect(el.scrollTop).toBe(100);
  });

  it('offers a way back, and taking it resumes following', async () => {
    const { el, rerender, lines } = mount();

    setScroll(el, 100);
    rerender(<EventLog lines={[...lines, { text: 'new', category: 'info', id: 1 }]} />);
    await nextFrame();

    const jump = screen.getByTestId('jump-to-latest');
    fireEvent.click(jump);
    await nextFrame();

    expect(el.scrollTop).toBe(1000);
    expect(screen.queryByTestId('jump-to-latest')).toBeNull();
  });

  it('shows no control while it is following', () => {
    mount();
    expect(screen.queryByTestId('jump-to-latest')).toBeNull();
  });
});
