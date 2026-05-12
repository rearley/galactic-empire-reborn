import { weaponFireRangeRespected } from '../../src/game/invariants/combat-ranges.invariants';

describe('weaponFireRangeRespected', () => {
  it('flags a combat event fired outside the weapon max range', () => {
    const world = {
      combatEvents: [
        {
          weapon: 'phasor',
          shooter: { x: 0, y: 0 },
          target: { x: 99, y: 99 },
          maxRange: 5,
        },
      ],
    };

    const violations = weaponFireRangeRespected.run(world);

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('weaponFireRangeRespected');
    expect(violations[0].severity).toBe('HIGH');
  });

  it('passes when shooter is within range', () => {
    const world = {
      combatEvents: [
        {
          weapon: 'phasor',
          shooter: { x: 0, y: 0 },
          target: { x: 1, y: 1 },
          maxRange: 5,
        },
      ],
    };

    expect(weaponFireRangeRespected.run(world)).toEqual([]);
  });

  it('returns no violations on an empty / missing snapshot slice', () => {
    expect(weaponFireRangeRespected.run({})).toEqual([]);
    expect(weaponFireRangeRespected.run({ combatEvents: [] })).toEqual([]);
  });
});
