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

  it('empty input Enter does not call onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input');
    await userEvent.type(input, '{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('whitespace-only input does not call onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('command-input');
    await userEvent.type(input, '   {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
