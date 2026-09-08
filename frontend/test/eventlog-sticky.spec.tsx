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

/**
 * A burst must not be mistaken for the reader scrolling away.
 *
 * The scroll event for a programmatic write is dispatched in the FOLLOWING
 * frame's scroll steps, not synchronously. When a combat burst lands in
 * between, `scrollHeight` has grown while `scrollTop` still holds the value we
 * wrote — so a naive distance-from-bottom reading attributes the whole burst
 * to the reader and disengages auto-scroll. The pending rAF then scrolls to the
 * bottom regardless and the next scroll event re-engages, so the symptom is a
 * FLASH of "jump to latest" during heavy combat rather than a stuck log.
 *
 * Reported from play: "had a brief jump to last on the ui".
 *
 * `scrollTop` here clamps the way a real element does, so the pixel figures are
 * the browser's rather than jsdom's unclamped ones.
 */
function mountWithClamping() {
  const lines: LogEntry[] = [{ text: 'line 0', category: 'info', id: 0 }];
  const view = render(<EventLog lines={lines} />);
  const el = screen.getByTestId('event-log');
  let height = 1000;
  let top = 0;
  Object.defineProperty(el, 'clientHeight', { value: 400, writable: true });
  Object.defineProperty(el, 'scrollHeight', {
    get: () => height,
    set: (v: number) => { height = v; },
  });
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    set: (v: number) => { top = Math.max(0, Math.min(v, height - 400)); },
  });
  // `scrollHeight` is read-only in the DOM typings, so growth goes through this
  // rather than an assignment the compiler rejects.
  const grow = (to: number) => { height = to; };
  return { ...view, el, lines, grow };
}

describe('EventLog during a burst', () => {
  it('does not offer to jump when only the content grew', async () => {
    const { el, rerender, lines, grow } = mountWithClamping();

    // Following: the effect writes scrollTop, which clamps to the bottom.
    rerender(<EventLog lines={[...lines, { text: 'a', category: 'combat', id: 1 }]} />);
    await nextFrame();
    expect(el.scrollTop).toBe(600);

    // The burst lands before the browser dispatches the scroll event for that
    // write. Ten lines of growth; scrollTop is untouched.
    grow(1200);
    fireEvent.scroll(el);

    expect(screen.queryByTestId('jump-to-latest')).toBeNull();
  });

  it('keeps following after the burst, rather than stranding the reader', async () => {
    // The flash and the stuck log are the SAME bug racing differently. When the
    // stale event flips sticky off, the effect cleanup cancels the pending rAF:
    // if that rAF already fired the log recovers and you only see a flicker, if
    // the cleanup wins the log stops following and the button is the only way
    // back. Reported from play: "this time I had to use it".
    const { el, rerender, lines, grow } = mountWithClamping();

    rerender(<EventLog lines={[...lines, { text: 'a', category: 'combat', id: 1 }]} />);
    await nextFrame();

    grow(1200);
    fireEvent.scroll(el);

    // Still following, so the next line arrives without any click.
    grow(1400);
    rerender(<EventLog lines={[...lines, { text: 'b', category: 'combat', id: 2 }]} />);
    await nextFrame();

    expect(el.scrollTop).toBe(1000);
    expect(screen.queryByTestId('jump-to-latest')).toBeNull();
  });

  it('still offers to jump when the reader actually scrolls up', async () => {
    const { el, rerender, lines } = mountWithClamping();

    rerender(<EventLog lines={[...lines, { text: 'a', category: 'combat', id: 1 }]} />);
    await nextFrame();

    el.scrollTop = 100;
    fireEvent.scroll(el);

    expect(screen.getByTestId('jump-to-latest')).toBeTruthy();
  });
});
