import { isInNeutralZone } from '../../src/game/combat/neutral-zone';

describe('isInNeutralZone', () => {
  it('is true inside the origin sector (-0.5, 0.5)', () => {
    expect(isInNeutralZone({ xcoord: 0, ycoord: 0 })).toBe(true);
    expect(isInNeutralZone({ xcoord: 0.49, ycoord: -0.49 })).toBe(true);
  });
  it('is false outside the origin sector', () => {
    expect(isInNeutralZone({ xcoord: 0.5, ycoord: 0 })).toBe(false);
    expect(isInNeutralZone({ xcoord: 3, ycoord: 2 })).toBe(false);
    expect(isInNeutralZone({ xcoord: -1, ycoord: 0 })).toBe(false);
  });
});
