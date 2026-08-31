import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShipSelectPrompt } from '../src/onboarding/ShipSelectPrompt';

/**
 * Buying a second ship made an account unplayable in the browser. The gateway
 * emits `prompt:ship-select` when a captain owns more than one hull and waits
 * for a `prompt:reply` before boarding anything — but the frontend had no
 * listener for that event, so the player connected into a session with no
 * active ship, an empty log, and "No active ship." as the answer to everything.
 *
 * @see specs/030-multi-ship/task-7-brief.md
 */
const FLEET = [
  { index: 1, shipno: 1, className: 'Interceptor', shipname: 'Phoenix', sector: { x: 0, y: 0 } },
  { index: 2, shipno: 2, className: 'Stealth Fighter', shipname: 'Shadow', sector: { x: 3, y: -4 } },
];

describe('ShipSelectPrompt', () => {
  it('lists every ship with its index, name, class and sector', () => {
    render(<ShipSelectPrompt ships={FLEET} onSelect={vi.fn()} error={null} />);
    const text = screen.getByTestId('ship-select').textContent ?? '';
    expect(text).toContain('Phoenix');
    expect(text).toContain('Interceptor');
    expect(text).toContain('Shadow');
    expect(text).toContain('Stealth Fighter');
    expect(text).toContain('(3, -4)');
  });

  it('sends the chosen index on Enter', () => {
    const onSelect = vi.fn();
    render(<ShipSelectPrompt ships={FLEET} onSelect={onSelect} error={null} />);
    const input = screen.getByTestId('ship-select-input');
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('ignores an index outside the fleet', () => {
    const onSelect = vi.fn();
    render(<ShipSelectPrompt ships={FLEET} onSelect={onSelect} error={null} />);
    const input = screen.getByTestId('ship-select-input');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores a non-numeric entry', () => {
    const onSelect = vi.fn();
    render(<ShipSelectPrompt ships={FLEET} onSelect={onSelect} error={null} />);
    const input = screen.getByTestId('ship-select-input');
    fireEvent.change(input, { target: { value: 'Phoenix' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the server error when a choice is rejected', () => {
    render(<ShipSelectPrompt ships={FLEET} onSelect={vi.fn()} error="That ship is no longer available." />);
    expect(screen.getByRole('alert').textContent).toContain('no longer available');
  });

  it('keeps the padded columns intact rather than letting HTML collapse them', () => {
    render(<ShipSelectPrompt ships={FLEET} onSelect={vi.fn()} error={null} />);
    const list = screen.getByTestId('ship-select').querySelector('ul');
    expect(list?.className).toContain('whitespace-pre');
  });
});
