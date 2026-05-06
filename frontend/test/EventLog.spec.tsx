import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventLog } from '../src/components/EventLog';
import type { EventLogLine } from '../src/types/contracts';

describe('EventLog', () => {
  it('renders lines in arrival order', () => {
    const lines: EventLogLine[] = [
      { text: 'First line', category: 'info' },
      { text: 'Second line', category: 'success' },
      { text: 'Third line', category: 'system' },
    ];
    render(<EventLog lines={lines} />);
    const logLines = screen.getAllByTestId(/^log-line-/);
    expect(logLines[0].textContent).toBe('First line');
    expect(logLines[1].textContent).toBe('Second line');
    expect(logLines[2].textContent).toBe('Third line');
  });

  it('applies per-category className for system, success, combat', () => {
    const lines: EventLogLine[] = [
      { text: 'sys', category: 'system' },
      { text: 'ok', category: 'success' },
      { text: 'combat', category: 'combat' },
    ];
    render(<EventLog lines={lines} />);
    expect(screen.getAllByTestId('log-line-system')[0].className).toContain('text-gray-400');
    expect(screen.getAllByTestId('log-line-success')[0].className).toContain('text-green-400');
    expect(screen.getAllByTestId('log-line-combat')[0].className).toContain('text-red-400');
  });

  it('renders empty list without crashing', () => {
    render(<EventLog lines={[]} />);
    expect(screen.getByTestId('event-log')).toBeDefined();
  });

  it('auto-scrolls on update (scrollTop set to scrollHeight after update)', () => {
    const lines: EventLogLine[] = [{ text: 'line 1', category: 'info' }];
    const { rerender } = render(<EventLog lines={lines} />);
    const container = screen.getByTestId('event-log');

    Object.defineProperty(container, 'scrollHeight', { value: 500, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, writable: true });

    rerender(<EventLog lines={[...lines, { text: 'line 2', category: 'success' }]} />);
    expect(container.scrollTop).toBe(500);
  });

  // T009: 500-entry buffer cap with FIFO drop (FR-010)
  it('renders at most 500 lines — oldest dropped when more are provided', () => {
    const lines: EventLogLine[] = Array.from({ length: 501 }, (_, i) => ({
      text: `line ${i}`,
      category: 'info' as const,
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
    const lines: EventLogLine[] = [{ text: 'line 1', category: 'info' }];
    const { rerender } = render(<EventLog lines={lines} />);
    const container = screen.getByTestId('event-log');

    Object.defineProperty(container, 'scrollHeight', { value: 500, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, writable: true });
    // Simulate user scrolled up significantly
    Object.defineProperty(container, 'scrollTop', { value: 100, writable: true });
    fireEvent.scroll(container);

    // Trigger a new line
    rerender(<EventLog lines={[...lines, { text: 'line 2', category: 'info' }]} />);
    // scrollTop should remain at 100 (not jumped to scrollHeight)
    expect(container.scrollTop).toBe(100);
  });

  // T009: auto-scroll resumes when user scrolls back to bottom (FR-008)
  it('resumes auto-scroll when user scrolls back to bottom', () => {
    const lines: EventLogLine[] = [{ text: 'line 1', category: 'info' }];
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
    rerender(<EventLog lines={[...lines, { text: 'line 2', category: 'info' }]} />);
    expect(container.scrollTop).toBe(500);
  });

  // T009: nav and chat categories get distinct styling (FR-009)
  it('applies distinct styling for nav and chat categories', () => {
    const lines = [
      { text: 'nav msg', category: 'nav' as string },
      { text: 'chat msg', category: 'chat' as string },
    ] as EventLogLine[];
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
    const lines = [{ text: 'future event', category: 'droid.spawned' as string }] as EventLogLine[];
    expect(() => render(<EventLog lines={lines} />)).not.toThrow();
    const el = screen.getByTestId('log-line-droid.spawned');
    expect(el.textContent).toBe('future event');
    // fallback class must be non-empty
    expect(el.className.length).toBeGreaterThan(0);
  });
});
