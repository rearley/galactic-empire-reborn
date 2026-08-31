import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShipNamePrompt } from '../src/onboarding/ShipNamePrompt';

/**
 * The gateway distinguishes `invalid-format` from `name-taken`, but the prompt
 * rendered one hard-coded sentence for both: "That name is already taken."
 *
 * Ship names are a single token of printable ASCII with no spaces
 * (GECMDS.C:5002 strncpy of margv[1]), so a pilot naming their ship
 * "Ravenspur II" was told the name was taken — sending them off to invent a
 * different name when the real problem was the space. It cost me two attempts
 * during a playtest.
 */
describe('ShipNamePrompt error messages', () => {
  it('says the name is taken when it is taken', () => {
    render(<ShipNamePrompt onSubmit={vi.fn()} error="name-taken" />);
    expect(screen.getByRole('alert').textContent).toMatch(/already taken/i);
  });

  it('explains the format when the name is malformed, not that it is taken', () => {
    render(<ShipNamePrompt onSubmit={vi.fn()} error="invalid-format" />);
    const text = screen.getByRole('alert').textContent ?? '';
    expect(text).not.toMatch(/already taken/i);
    expect(text).toMatch(/space|19|character/i);
  });

  it('shows nothing when there is no error', () => {
    render(<ShipNamePrompt onSubmit={vi.fn()} error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('states the rule up front so the first attempt succeeds', () => {
    render(<ShipNamePrompt onSubmit={vi.fn()} error={null} />);
    expect(document.body.textContent).toMatch(/no spaces/i);
  });
});
