import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FkeyBar, chipLabel } from '../src/components/FkeyBar';

const bindings = (over: Record<number, string> = {}): string[] =>
  Array.from({ length: 12 }, (_, i) => over[i + 1] ?? '');

/**
 * The phone's shortcut bar.
 *
 * `fset f1 pha 0 0` then `f1` is the port's typed binding — a browser cannot
 * claim the real F-keys, so the slot is a command you type. On a touch
 * keyboard typing anything is the expensive part, so each bound slot becomes
 * one tap. Sends exactly what typing the slot would: the bound text, through
 * the same socket path.
 */
describe('FkeyBar', () => {
  it('shows a chip per BOUND slot, in slot order', () => {
    render(<FkeyBar fkeys={bindings({ 1: 'pha 0', 3: 'scan sh', 2: 'shi up' })} onSend={vi.fn()} />);
    const chips = screen.getAllByTestId(/^fkey-chip-/);
    expect(chips.map((c) => c.textContent)).toEqual(['f1 pha 0', 'f2 shi up', 'f3 scan sh']);
  });

  it('clips a long binding so two chips still fit a phone row', () => {
    expect(chipLabel('scan lo full')).toBe('scan lo f…');
    expect(chipLabel('shi up')).toBe('shi up');
    // Ten characters is not worth an ellipsis that costs one.
    expect(chipLabel('pha 0 0 45')).toBe('pha 0 0 45');
  });

  it('keeps the WHOLE command reachable, clipped or not', () => {
    render(<FkeyBar fkeys={bindings({ 1: 'scan lo full' })} onSend={vi.fn()} />);
    const chip = screen.getByTestId('fkey-chip-f1');
    expect(chip).toHaveAttribute('title', 'f1: scan lo full');
    expect(chip).toHaveAccessibleName('f1 scan lo full');
  });

  it('leaves unbound slots out rather than showing twelve empties', () => {
    render(<FkeyBar fkeys={bindings({ 5: 'war 0' })} onSend={vi.fn()} />);
    expect(screen.getAllByTestId(/^fkey-chip-/)).toHaveLength(1);
    expect(screen.queryByTestId('fkey-chip-f1')).not.toBeInTheDocument();
  });

  it('sends the bound command on tap, not the slot name', () => {
    const onSend = vi.fn();
    render(<FkeyBar fkeys={bindings({ 1: 'pha 0' })} onSend={onSend} />);
    return userEvent.click(screen.getByTestId('fkey-chip-f1')).then(() => {
      expect(onSend).toHaveBeenCalledWith('pha 0');
    });
  });

  it('renders nothing at all when no slot is bound', () => {
    const { container } = render(<FkeyBar fkeys={bindings()} onSend={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('wraps onto more rows rather than hiding chips off the right edge', () => {
    // One row showed four of the owner's nine bindings and gave no hint the
    // rest existed. Everything bound must be visible; the height is capped so
    // twelve cannot swallow the log.
    render(<FkeyBar fkeys={Array.from({ length: 12 }, (_, i) => `cmd${i}`)} onSend={vi.fn()} />);
    const bar = screen.getByTestId('fkey-bar');
    expect(bar.className).toMatch(/flex-wrap/);
    expect(bar.className).not.toMatch(/overflow-x-auto/);
    expect(bar.className).toMatch(/max-h-/);
    expect(screen.getAllByTestId(/^fkey-chip-/)).toHaveLength(12);
  });
});
