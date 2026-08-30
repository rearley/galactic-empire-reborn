import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
