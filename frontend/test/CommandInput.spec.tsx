import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandInput } from '../src/components/CommandInput';

describe('CommandInput', () => {
  it('typing and pressing Enter calls onSubmit with trimmed text', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input');
    await userEvent.type(input, 'rotate 90{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('rotate 90');
  });

  it('input clears after submit', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input') as HTMLInputElement;
    await userEvent.type(input, 'rot 45{Enter}');
    expect(input.value).toBe('');
  });

  /**
   * A bare Enter is a real input in the original: `if (margc == 0) warnop();`
   * prints FORHELP (GECMDS.C:282-284). The router answers it, so the client
   * must actually send it rather than dropping it here — otherwise the server
   * behaviour is unreachable, which is what it was.
   */
  it('empty input Enter still submits, so the server can answer FORHELP', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input');
    await userEvent.type(input, '{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('');
  });

  it('whitespace-only input submits as empty', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input');
    await userEvent.type(input, '   {Enter}');
    expect(onSubmit).toHaveBeenCalledWith('');
  });

  it('does not put a blank line into the recall history', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input');
    await userEvent.type(input, 'rep nav{Enter}');
    await userEvent.type(input, '{Enter}');
    await userEvent.type(input, '{ArrowUp}');
    expect(input).toHaveValue('rep nav');
  });

  // T010a: accent color applied (FR-001)
  it('renders the prompt prefix with the accent color class', () => {
    render(<CommandInput onSubmit={vi.fn()} />);
    const prompt = screen.getByText('>');
    expect(prompt.className).toContain('text-accent');
  });

  // T008: command history (FR-004)

  it('up arrow after a submit recalls the last submitted command', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input') as HTMLInputElement;
    await userEvent.type(input, 'scan{Enter}');
    await userEvent.type(input, '{ArrowUp}');
    expect(input.value).toBe('scan');
  });

  it('up arrow with no history does nothing', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input') as HTMLInputElement;
    await userEvent.type(input, '{ArrowUp}');
    expect(input.value).toBe('');
  });

  it('down arrow after up arrow restores the draft (empty after submit)', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input') as HTMLInputElement;
    await userEvent.type(input, 'scan{Enter}');
    await userEvent.type(input, '{ArrowUp}');
    await userEvent.type(input, '{ArrowDown}');
    expect(input.value).toBe('');
  });

  it('draft is saved when navigating up and restored on return', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input') as HTMLInputElement;
    await userEvent.type(input, 'scan{Enter}');
    await userEvent.type(input, 'ph');       // draft in progress
    await userEvent.type(input, '{ArrowUp}');
    expect(input.value).toBe('scan');
    await userEvent.type(input, '{ArrowDown}');
    expect(input.value).toBe('ph');          // draft restored
  });

  it('history is bounded to 20 entries — 21st submit does not increase recall depth', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input') as HTMLInputElement;
    for (let i = 1; i <= 21; i++) {
      await userEvent.type(input, `cmd${i}{Enter}`);
    }
    // Press up 21 times; the 21st should NOT recall cmd1
    for (let i = 0; i < 20; i++) {
      await userEvent.type(input, '{ArrowUp}');
    }
    expect(input.value).toBe('cmd2'); // oldest retained (cmd1 was dropped)
    // One more up should stay at cmd2 (or move no further)
    await userEvent.type(input, '{ArrowUp}');
    expect(input.value).toBe('cmd2');
  });
});
