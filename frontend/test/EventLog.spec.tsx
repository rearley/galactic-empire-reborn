import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EventLog } from '../src/components/EventLog';
import type { LogEntry } from '../src/types/logEntry';

/** Flush one animation frame — the log coalesces its scroll into one. */
const nextFrame = () => act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });

describe('EventLog', () => {
  it('renders lines in arrival order', () => {
    const lines: LogEntry[] = [
      { text: 'First line', category: 'info', id: 1 },
      { text: 'Second line', category: 'success', id: 2 },
      { text: 'Third line', category: 'system', id: 3 },
    ];
    render(<EventLog lines={lines} />);
    const logLines = screen.getAllByTestId(/^log-line-/);
    expect(logLines[0].textContent).toBe('First line');
    expect(logLines[1].textContent).toBe('Second line');
    expect(logLines[2].textContent).toBe('Third line');
  });

  it('preserves runs of whitespace so fixed-width command tables stay aligned', () => {
    // `who`, `ros`, `pla` and `pri` pad their columns with spaces
    // (who.handler.ts uses padEnd(22)/padEnd(20)/padStart(5)). Without a
    // whitespace-preserving class the browser collapses those runs and the
    // ASCII table loses its alignment entirely.
    const lines: LogEntry[] = [
      { text: '  Shipname               Class                Sector  Kills', category: 'info', id: 4 },
      { text: 'Defiant               Interceptor          ( 0, 0)      0', category: 'info', id: 5 },
    ];
    render(<EventLog lines={lines} />);
    const logLines = screen.getAllByTestId(/^log-line-/);

    for (const line of logLines) {
      expect(line.className).toMatch(/whitespace-pre/);
    }
    // The padding must survive into the DOM, not be normalised away.
    expect(logLines[0].textContent).toContain('               Class');
  });

  it('applies per-category className for system, success, combat', () => {
    const lines: LogEntry[] = [
      { text: 'sys', category: 'system', id: 6 },
      { text: 'ok', category: 'success', id: 7 },
      { text: 'combat', category: 'combat', id: 8 },
    ];
    render(<EventLog lines={lines} />);
    expect(screen.getAllByTestId('log-line-system')[0].className).toContain('text-gray-400');
    expect(screen.getAllByTestId('log-line-success')[0].className).toContain('text-green-400');
    expect(screen.getAllByTestId('log-line-combat')[0].className).toContain('text-red-400');
  });

  it('styles an alert distinctly from an ordinary system line', () => {
    // `alert` was a valid EventLogCategory in @ge/wire with no entry in
    // CATEGORY_CLASS, so it fell through to the default and rendered exactly
    // like `system` — silently discarding the one distinction the category
    // exists to carry. The redeploy countdown is the first line to use it, and
    // it is precisely the line that must not look like routine chatter.
    const lines: LogEntry[] = [
      { text: 'Fleet-wide systems shutdown in 45 seconds, Sir.', category: 'alert', id: 20 },
      { text: 'routine', category: 'system', id: 21 },
    ];
    render(<EventLog lines={lines} />);

    const alert = screen.getAllByTestId('log-line-alert')[0];
    const system = screen.getAllByTestId('log-line-system')[0];
    expect(alert.className).toContain('text-orange-300');
    expect(alert.className).not.toEqual(system.className);
  });

  it('renders empty list without crashing', () => {
    render(<EventLog lines={[]} />);
    expect(screen.getByTestId('event-log')).toBeDefined();
  });

  /**
   * The scroll is coalesced to one write per animation frame — a combat burst
   * arrives as many separate socket events, and writing scrollTop for each one
   * forced a layout per line and fought a player trying to scroll up. These
   * two cases pinned the write being SYNCHRONOUS, which was never the
   * contract; they now await a frame.
   */
  it('auto-scrolls on update (scrollTop set to scrollHeight after update)', async () => {
    const lines: LogEntry[] = [{ text: 'line 1', category: 'info', id: 9 }];
    const { rerender } = render(<EventLog lines={lines} />);
    const container = screen.getByTestId('event-log');

    Object.defineProperty(container, 'scrollHeight', { value: 500, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, writable: true });

    rerender(<EventLog lines={[...lines, { text: 'line 2', category: 'success', id: 10 }]} />);
    await nextFrame();
    expect(container.scrollTop).toBe(500);
  });

  /**
   * The container SHRINKING must re-scroll a following log.
   *
   * Reported from production on the redeploy sign-off: the last line arrived
   * and "did not seem to scroll". Nothing is wrong with the line. The socket
   * closes a moment after it, `ConnectionBanner` appears above the log, and the
   * flex-1 container loses that height — so content already written sits below
   * the fold. The scroll effect is keyed on `lines`, which did NOT change, so
   * nothing brought it back.
   *
   * Not specific to the sign-off: the banner appears on every disconnect, and
   * the phone's shortcut bar changes height whenever a binding is added.
   */
  it('re-scrolls when the container shrinks under it', async () => {
    const observers: Array<() => void> = [];
    const RO = vi.fn(function (this: unknown, cb: () => void) {
      observers.push(cb);
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    });
    vi.stubGlobal('ResizeObserver', RO);

    const lines: LogEntry[] = [{ text: 'line 1', category: 'info', id: 30 }];
    render(<EventLog lines={lines} />);
    const container = screen.getByTestId('event-log');
    Object.defineProperty(container, 'scrollHeight', { value: 500, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, writable: true });
    await nextFrame();

    // The banner appears: same content, less room for it.
    container.scrollTop = 0;
    Object.defineProperty(container, 'clientHeight', { value: 140, writable: true });
    expect(observers.length).toBeGreaterThan(0);
    observers.forEach((cb) => { act(() => cb()); });
    await nextFrame();

    expect(container.scrollTop).toBe(500);
    vi.unstubAllGlobals();
  });

  // T009: 500-entry buffer cap with FIFO drop (FR-010)
  it('renders at most 500 lines — oldest dropped when more are provided', () => {
    const lines: LogEntry[] = Array.from({ length: 501 }, (_, i) => ({
      text: `line ${i}`,
      category: 'info' as const,
      id: i,
    }));
    render(<EventLog lines={lines} />);
    const rendered = screen.getAllByTestId(/^log-line-/);
    expect(rendered).toHaveLength(500);
    // First rendered line should be line 1 (line 0 dropped)
    expect(rendered[0].textContent).toBe('line 1');
    // Last rendered line should be line 500
    expect(rendered[499].textContent).toBe('line 500');
  });

  // T009: auto-scroll pauses when user scrolls up (FR-008, research.md R2)
  it('does not auto-scroll when user has scrolled up', () => {
    const lines: LogEntry[] = [{ text: 'line 1', category: 'info', id: 11 }];
    const { rerender } = render(<EventLog lines={lines} />);
    const container = screen.getByTestId('event-log');

    Object.defineProperty(container, 'scrollHeight', { value: 500, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, writable: true });
    // Simulate user scrolled up significantly
    Object.defineProperty(container, 'scrollTop', { value: 100, writable: true });
    fireEvent.scroll(container);

    // Trigger a new line
    rerender(<EventLog lines={[...lines, { text: 'line 2', category: 'info', id: 12 }]} />);
    // scrollTop should remain at 100 (not jumped to scrollHeight)
    expect(container.scrollTop).toBe(100);
  });

  // T009: auto-scroll resumes when user scrolls back to bottom (FR-008)
  it('resumes auto-scroll when user scrolls back to bottom', async () => {
    const lines: LogEntry[] = [{ text: 'line 1', category: 'info', id: 13 }];
    const { rerender } = render(<EventLog lines={lines} />);
    const container = screen.getByTestId('event-log');

    Object.defineProperty(container, 'scrollHeight', { value: 500, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, writable: true });

    // Scroll up to pause
    Object.defineProperty(container, 'scrollTop', { value: 100, writable: true });
    fireEvent.scroll(container);

    // Scroll back to bottom (scrollTop + clientHeight >= scrollHeight - threshold)
    Object.defineProperty(container, 'scrollTop', { value: 300, writable: true });
    fireEvent.scroll(container);

    // New line arrives — should auto-scroll now
    rerender(<EventLog lines={[...lines, { text: 'line 2', category: 'info', id: 14 }]} />);
    await nextFrame();
    expect(container.scrollTop).toBe(500);
  });

  // T009: nav and chat categories get distinct styling (FR-009)
  it('applies distinct styling for nav and chat categories', () => {
    const lines = [
      { text: 'nav msg', category: 'nav' as string },
      { text: 'chat msg', category: 'chat' as string },
    ] as LogEntry[];
    render(<EventLog lines={lines} />);
    const navEl = screen.getByTestId('log-line-nav');
    const chatEl = screen.getByTestId('log-line-chat');
    // Both must have a class (not the default fallback empty string)
    expect(navEl.className.length).toBeGreaterThan(0);
    expect(chatEl.className.length).toBeGreaterThan(0);
    // Nav and chat must differ from each other and from combat/system
    expect(navEl.className).not.toBe(chatEl.className);
  });

  // T009: unknown category falls back gracefully without throwing (FR-011)
  it('renders unknown category with a fallback style and does not throw', () => {
    const lines = [{ text: 'future event', category: 'droid.spawned' as string }] as LogEntry[];
    expect(() => render(<EventLog lines={lines} />)).not.toThrow();
    const el = screen.getByTestId('log-line-droid.spawned');
    expect(el.textContent).toBe('future event');
    // fallback class must be non-empty
    expect(el.className.length).toBeGreaterThan(0);
  });
});
