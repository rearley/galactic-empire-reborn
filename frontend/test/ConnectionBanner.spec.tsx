import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionBanner } from '../src/components/ConnectionBanner';

/**
 * Verifies ConnectionBanner visibility and copy per connection status (FR-019).
 * @see specs/010-react-frontend/data-model.md §B.5
 */
describe('ConnectionBanner', () => {
  it('renders nothing when status is connected (FR-019)', () => {
    const { container } = render(<ConnectionBanner status="connected" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a visible banner when status is connecting (FR-019)', () => {
    render(<ConnectionBanner status="connecting" />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByRole('status').textContent).toMatch(/connecting/i);
  });

  it('renders a visible banner when status is disconnected (FR-019)', () => {
    render(<ConnectionBanner status="disconnected" />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByRole('status').textContent).toMatch(/disconnected/i);
  });

  it('renders a visible banner when status is reconnecting (FR-019)', () => {
    render(<ConnectionBanner status="reconnecting" />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByRole('status').textContent).toMatch(/reconnecting/i);
  });

  it('banner for disconnected has distinct styling from reconnecting (FR-019)', () => {
    const { rerender, container } = render(<ConnectionBanner status="disconnected" />);
    const disconnectedClass = (container.firstChild as HTMLElement)?.className ?? '';

    rerender(<ConnectionBanner status="reconnecting" />);
    const reconnectingClass = (container.firstChild as HTMLElement)?.className ?? '';

    expect(disconnectedClass).not.toBe(reconnectingClass);
  });
});

/**
 * A session displaced by a newer login is not a network fault, and telling the
 * player to "check your connection" sends them to diagnose the wrong thing.
 *
 * The server already explains itself — `SESSION_REPLACED` carries "Another
 * session connected with your credentials." (game.gateway.ts:374) — and the
 * client discarded it, then stopped reconnecting on purpose, leaving a red
 * banner blaming the network and no way back except a manual page reload.
 */
describe('ConnectionBanner — displaced session', () => {
  it('says the session was taken over, not that the network failed', () => {
    render(<ConnectionBanner status="displaced" />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text.toLowerCase()).toContain('another session');
    expect(text.toLowerCase()).not.toContain('check your connection');
  });

  it('offers a way back rather than leaving the player stuck', () => {
    render(<ConnectionBanner status="displaced" />);
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
  });

  it('calls back when the player asks to reconnect', async () => {
    const onReconnect = vi.fn();
    render(<ConnectionBanner status="displaced" onReconnect={onReconnect} />);
    await userEvent.click(screen.getByRole('button', { name: /reconnect/i }));
    expect(onReconnect).toHaveBeenCalled();
  });

  it('still blames the network for an ordinary disconnect', () => {
    render(<ConnectionBanner status="disconnected" />);
    expect(screen.getByRole('status').textContent).toContain('check your connection');
  });
});
