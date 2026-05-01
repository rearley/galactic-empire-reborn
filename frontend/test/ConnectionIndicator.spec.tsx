import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionIndicator } from '../src/components/ConnectionIndicator';
import type { ConnectionStatus } from '../src/socket/useSocket';

describe('ConnectionIndicator', () => {
  const statuses: ConnectionStatus[] = ['connected', 'connecting', 'reconnecting', 'disconnected'];

  it('renders "Connected" label for connected status', () => {
    render(<ConnectionIndicator status="connected" />);
    expect(screen.getByTestId('status-label').textContent).toBe('Connected');
  });

  it('renders "Connecting…" label for connecting status', () => {
    render(<ConnectionIndicator status="connecting" />);
    expect(screen.getByTestId('status-label').textContent).toContain('Connecting');
  });

  it('renders "Reconnecting…" label for reconnecting status', () => {
    render(<ConnectionIndicator status="reconnecting" />);
    expect(screen.getByTestId('status-label').textContent).toContain('Reconnecting');
  });

  it('renders "Disconnected" label for disconnected status', () => {
    render(<ConnectionIndicator status="disconnected" />);
    expect(screen.getByTestId('status-label').textContent).toBe('Disconnected');
  });

  it('renders all four statuses without crashing', () => {
    for (const status of statuses) {
      const { unmount } = render(<ConnectionIndicator status={status} />);
      expect(screen.getByTestId('status-dot')).toBeDefined();
      unmount();
    }
  });
});
