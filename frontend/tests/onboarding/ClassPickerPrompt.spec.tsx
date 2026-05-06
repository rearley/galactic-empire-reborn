// @vitest-environment jsdom

/**
 * T030 — ClassPickerPrompt (TDD, intentionally failing until implementation).
 *
 * ClassPickerPrompt is rendered when the server emits a `prompt:class-list`
 * event during onboarding.  It must:
 *   - Display each ship class by name
 *   - Emit `prompt:reply { value: classNumber }` on the socket when the player
 *     selects a class
 *
 * @see specs/011-onboarding/plan.md §ClassPickerPrompt
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Inline type — ShipClassEntry will live in src/types/contracts.ts once implemented.
interface ShipClassEntry {
  classNumber: number;
  typeName: string;
  description: string;
  maxShields: number;
  maxPhaser: number;
  maxWarp: number;
  hasTorpedo: boolean;
  hasMissile: boolean;
}

// This import will fail until src/onboarding/ClassPickerPrompt.tsx is created.
import { ClassPickerPrompt } from '../../src/onboarding/ClassPickerPrompt';

const SAMPLE_CLASSES: ShipClassEntry[] = [
  {
    classNumber: 1,
    typeName: 'Interceptor',
    description: 'Fast and agile scout vessel.',
    maxShields: 10,
    maxPhaser: 10,
    maxWarp: 8,
    hasTorpedo: false,
    hasMissile: false,
  },
  {
    classNumber: 2,
    typeName: 'Destroyer',
    description: 'Balanced combat cruiser.',
    maxShields: 20,
    maxPhaser: 20,
    maxWarp: 6,
    hasTorpedo: true,
    hasMissile: false,
  },
  {
    classNumber: 3,
    typeName: 'Battleship',
    description: 'Heavy armour, slow but devastating.',
    maxShields: 40,
    maxPhaser: 40,
    maxWarp: 4,
    hasTorpedo: true,
    hasMissile: true,
  },
];

describe('ClassPickerPrompt (T030)', () => {
  const mockEmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when given a class-list payload', () => {
    render(
      <ClassPickerPrompt
        classes={SAMPLE_CLASSES}
        onSelect={mockEmit}
      />,
    );
    // The component should be present in the DOM — any testId or heading works.
    expect(screen.getByTestId('class-picker')).toBeDefined();
  });

  it('shows each class name', () => {
    render(
      <ClassPickerPrompt
        classes={SAMPLE_CLASSES}
        onSelect={mockEmit}
      />,
    );
    expect(screen.getByText('Interceptor')).toBeDefined();
    expect(screen.getByText('Destroyer')).toBeDefined();
    expect(screen.getByText('Battleship')).toBeDefined();
  });

  it('calls onSelect with the classNumber when a class is chosen', async () => {
    const user = userEvent.setup();
    render(
      <ClassPickerPrompt
        classes={SAMPLE_CLASSES}
        onSelect={mockEmit}
      />,
    );

    // Click the first class — Interceptor (classNumber 1).
    await user.click(screen.getByText('Interceptor'));

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(1);
  });

  it('emits the correct classNumber for a different selection', async () => {
    const user = userEvent.setup();
    render(
      <ClassPickerPrompt
        classes={SAMPLE_CLASSES}
        onSelect={mockEmit}
      />,
    );

    await user.click(screen.getByText('Battleship'));

    expect(mockEmit).toHaveBeenCalledWith(3);
  });
});
