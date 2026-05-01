import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('applies per-category className', () => {
    const lines: EventLogLine[] = [
      { text: 'sys', category: 'system' },
      { text: 'info', category: 'info' },
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

    // Simulate scrollable content
    Object.defineProperty(container, 'scrollHeight', { value: 500, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, writable: true });

    rerender(<EventLog lines={[...lines, { text: 'line 2', category: 'success' }]} />);
    expect(container.scrollTop).toBe(500);
  });
});
