// @vitest-environment jsdom

/**
 * T031 — ShipNamePrompt (TDD, intentionally failing until implementation).
 *
 * ShipNamePrompt is displayed during onboarding so the player can choose a
 * ship name (1–19 printable ASCII characters).  It must:
 *   - Render a text input
 *   - Refuse to submit an empty name (no event emitted)
 *   - Call onSubmit with the trimmed name string on valid input
 *   - Display an error message when re-rendered with `error: 'name-taken'`
 *
 * @see specs/011-onboarding/plan.md §ShipNamePrompt
 * @see GEMAIN.H — ship name field is 20 bytes, max 19 usable characters
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// This import will fail until src/onboarding/ShipNamePrompt.tsx is created.
import { ShipNamePrompt } from '../../src/onboarding/ShipNamePrompt';

describe('ShipNamePrompt (T031)', () => {
  const mockSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a text input', () => {
    render(<ShipNamePrompt onSubmit={mockSubmit} error={null} />);
    expect(screen.getByRole('textbox')).toBeDefined();
  });

  it('does not submit when the name is empty', async () => {
    const user = userEvent.setup();
    render(<ShipNamePrompt onSubmit={mockSubmit} error={null} />);

    // Focus the input and press Enter without typing anything.
    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.keyboard('{Enter}');

    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when the name is whitespace only', async () => {
    const user = userEvent.setup();
    render(<ShipNamePrompt onSubmit={mockSubmit} error={null} />);

    await user.type(screen.getByRole('textbox'), '   ');
    await user.keyboard('{Enter}');

    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with the name when a valid name is submitted', async () => {
    const user = userEvent.setup();
    render(<ShipNamePrompt onSubmit={mockSubmit} error={null} />);

    await user.type(screen.getByRole('textbox'), 'StarFalcon');
    await user.keyboard('{Enter}');

    expect(mockSubmit).toHaveBeenCalledOnce();
    expect(mockSubmit).toHaveBeenCalledWith('StarFalcon');
  });

  it('does not submit a name exceeding 19 characters', async () => {
    const user = userEvent.setup();
    render(<ShipNamePrompt onSubmit={mockSubmit} error={null} />);

    // 20 printable ASCII characters — over the limit.
    await user.type(screen.getByRole('textbox'), 'A'.repeat(20));
    await user.keyboard('{Enter}');

    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('displays an error message when error prop is "name-taken"', () => {
    render(<ShipNamePrompt onSubmit={mockSubmit} error="name-taken" />);

    // The component should render some visible error text.
    expect(screen.getByRole('alert')).toBeDefined();
    // The error copy must mention the name being taken.
    expect(screen.getByRole('alert').textContent).toMatch(/taken/i);
  });

  it('shows no alert when error prop is null', () => {
    render(<ShipNamePrompt onSubmit={mockSubmit} error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
