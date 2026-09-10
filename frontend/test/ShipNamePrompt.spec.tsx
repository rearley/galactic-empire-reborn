import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShipNamePrompt } from '../src/onboarding/ShipNamePrompt';

/**
 * The gateway distinguishes `invalid-format` from `name-taken`, but the prompt
 * rendered one hard-coded sentence for both: "That name is already taken."
 *
 * The original note here said ship names were "a single token of printable
 * ASCII with no spaces (GECMDS.C:5002 strncpy of margv[1])", after a pilot
 * naming their ship "Ravenspur II" was told the name was taken.
 *
 * That reading was WRONG, and the same problem came back on 2026-09-09 with
 * "BigCat II". Canon runs `rstrin()` BEFORE the strncpy, which restores the
 * input line the tokeniser split, so `margv[1]` runs to the end of it — the
 * MajorBBS idiom for "the rest of the line", used identically by `cmd_send`
 * so that `sen A hello there` sends both words.
 *
 * Spaces were always legal. The restriction was invented here, and the first
 * fix explained the invented rule instead of checking it, which is why it took
 * a second pilot hitting the same wall to find.
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
    expect(document.body.textContent).toMatch(/19/);
  });

  it('does not claim spaces are forbidden, because they are not', () => {
    render(<ShipNamePrompt onSubmit={vi.fn()} error="invalid-format" />);
    expect(document.body.textContent ?? '').not.toMatch(/no spaces/i);
  });
});
