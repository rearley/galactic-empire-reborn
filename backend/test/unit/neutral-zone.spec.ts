import {
  isInNeutralZone,
  isNeutralZoneOwner,
  planetOwnerLabel,
  NEUTRAL_ZONE_OWNER,
  NEUTRAL_ZONE_OWNER_DISPLAY,
} from '../../src/game/combat/neutral-zone';

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

describe('neutral-zone owner presentation', () => {
  it('never shows the internal sentinel to a player', () => {
    expect(NEUTRAL_ZONE_OWNER_DISPLAY).not.toContain('*');
  });

  it('recognises the sentinel as the neutral owner', () => {
    expect(isNeutralZoneOwner(NEUTRAL_ZONE_OWNER)).toBe(true);
  });

  it('does not mistake a player id for the neutral owner', () => {
    expect(isNeutralZoneOwner('usr_a9070dc745a8688f')).toBe(false);
    expect(isNeutralZoneOwner(null)).toBe(false);
  });

  it('labels a trading post distinctly from a claimed planet', () => {
    // A pilot scanning a sector must be able to tell "somebody owns this"
    // from "this is a neutral trading post you can buy at".
    expect(planetOwnerLabel(NEUTRAL_ZONE_OWNER)).toBe(' — trading post');
    expect(planetOwnerLabel('usr_a9070dc745a8688f')).toBe(' — owned');
    expect(planetOwnerLabel(null)).toBe('');
  });
});
