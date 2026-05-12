import {
  aiCannotFireAcrossMap,
  aiRespectsNeutralZone,
} from '../../src/game/invariants/ai-targeting.invariants';

describe('aiCannotFireAcrossMap', () => {
  it('flags an AI fire event where distance*10000 exceeds shooter scanRange', () => {
    // Interceptor-class scanRange=100000 covers 10 sectors. Distance of 12 sectors must fail.
    const world = {
      aiFireEvents: [
        {
          shipClass: 'cybertron',
          shooter: { x: 0, y: 0 },
          target: { x: 12, y: 0 },
          scanRange: 100_000,
        },
      ],
    };

    const violations = aiCannotFireAcrossMap.run(world);

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('aiCannotFireAcrossMap');
    expect(violations[0].severity).toBe('HIGH');
  });

  it('uses distanceRaw when provided in place of recomputing from coords', () => {
    const world = {
      aiFireEvents: [
        {
          shipClass: 'droid-class-11',
          shooter: { x: 0, y: 0 },
          target: { x: 0, y: 0 },
          scanRange: 50_000,
          distanceRaw: 80_000,
        },
      ],
    };

    expect(aiCannotFireAcrossMap.run(world)).toHaveLength(1);
  });

  it('passes when the shot is within scanRange', () => {
    const world = {
      aiFireEvents: [
        {
          shipClass: 'cybertron',
          shooter: { x: 0, y: 0 },
          target: { x: 3, y: 0 },
          scanRange: 100_000,
        },
      ],
    };

    expect(aiCannotFireAcrossMap.run(world)).toEqual([]);
  });

  it('returns no violations on a missing snapshot slice', () => {
    expect(aiCannotFireAcrossMap.run({})).toEqual([]);
  });
});

describe('aiRespectsNeutralZone', () => {
  // GEPLANET.C:866-872 neutral() — sector (0,0) is the neutral zone.
  // GEMAIN.H:70-71 NEUTRAL_X=0, NEUTRAL_Y=0.
  it('flags an AI fire event targeting sector (0,0)', () => {
    const world = {
      aiFireEvents: [
        {
          shipClass: 'cybertron',
          shooter: { x: 2, y: 2 },
          target: { x: 0.5, y: 0.5 },
          scanRange: 100_000,
        },
      ],
    };

    const violations = aiRespectsNeutralZone.run(world);

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('aiRespectsNeutralZone');
    expect(violations[0].severity).toBe('HIGH');
  });

  it('passes when target is outside the neutral sector', () => {
    const world = {
      aiFireEvents: [
        {
          shipClass: 'cybertron',
          shooter: { x: 0, y: 0 },
          target: { x: 5, y: 5 },
          scanRange: 100_000,
        },
      ],
    };

    expect(aiRespectsNeutralZone.run(world)).toEqual([]);
  });

  it('returns no violations on a missing snapshot slice', () => {
    expect(aiRespectsNeutralZone.run({})).toEqual([]);
  });
});
