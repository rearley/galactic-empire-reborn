import {
  isInNeutralZone,
  isNeutralZoneOwner,
  planetOwnerLabel,
  NEUTRAL_ZONE_OWNER,
  NEUTRAL_ZONE_OWNER_DISPLAY,
} from '../../src/game/combat/neutral-zone';

describe('isInNeutralZone', () => {
  // These previously asserted a ±0.5 bubble around the origin POINT. C's
  // neutral() is floor-based over the whole sector (GEPLANET.C:866), so 0.49
  // with a NEGATIVE axis is sector -1 and not neutral, while 0.5 is.
  it('is true inside the origin sector [0, 1)', () => {
    expect(isInNeutralZone({ xcoord: 0, ycoord: 0 })).toBe(true);
    expect(isInNeutralZone({ xcoord: 0.49, ycoord: 0.49 })).toBe(true);
  });
  it('is false outside the origin sector', () => {
    expect(isInNeutralZone({ xcoord: 0.49, ycoord: -0.49 })).toBe(false);
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

/**
 * The neutral zone is the whole of sector (0,0), not a bubble around the
 * origin point.
 *
 *   xsect = coord1(coord->xcoord);   // floor
 *   ysect = coord1(coord->ycoord);
 *   return (xsect == 0 && ysect == 0);   — GEPLANET.C:866 neutral()
 *
 * `coord1` is floor, so the zone is 0 <= x < 1 and 0 <= y < 1. This port
 * tested a ±0.5 bubble instead, which is wrong at BOTH ends: it protected
 * x in (-0.5, 0), which floors to sector -1, and left x in [0.5, 1) exposed,
 * which is squarely inside sector 0.
 *
 * The five trading posts sit between 0.1 and 0.9 on each axis, so most of the
 * hub — the one place a new pilot is supposed to be safe — was outside the
 * bubble and open to fire. CybertronTickService had the rule right all along
 * (its own floor-based copy cites this same C line), so the AI honoured a
 * boundary the player weapons did not.
 */
describe('isInNeutralZone — the whole of sector (0,0)', () => {
  it('covers the sector C covers', () => {
    expect(isInNeutralZone({ xcoord: 0, ycoord: 0 })).toBe(true);
    expect(isInNeutralZone({ xcoord: 0.5, ycoord: 0.5 })).toBe(true);
    expect(isInNeutralZone({ xcoord: 0.999, ycoord: 0.999 })).toBe(true);
  });

  it('protects the trading posts, which sit at 0.1 to 0.9', () => {
    for (const c of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(isInNeutralZone({ xcoord: c, ycoord: c })).toBe(true);
    }
  });

  it('does not protect negative coordinates, which floor to sector -1', () => {
    expect(isInNeutralZone({ xcoord: -0.1, ycoord: 0.5 })).toBe(false);
    expect(isInNeutralZone({ xcoord: 0.5, ycoord: -0.4 })).toBe(false);
  });

  it('stops at the sector boundary', () => {
    expect(isInNeutralZone({ xcoord: 1, ycoord: 0.5 })).toBe(false);
    expect(isInNeutralZone({ xcoord: 0.5, ycoord: 1 })).toBe(false);
  });

  it('agrees with floor(x)==0 && floor(y)==0 across the grid', () => {
    for (let x = -1.5; x <= 2.5; x += 0.25) {
      for (let y = -1.5; y <= 2.5; y += 0.25) {
        expect(isInNeutralZone({ xcoord: x, ycoord: y }))
          .toBe(Math.floor(x) === 0 && Math.floor(y) === 0);
      }
    }
  });
});
