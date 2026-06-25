import { lineOfFire } from '../../../src/game/combat/combat-math';

// Firer at origin, heading 0 (north, -y). Victim due north at distance 2.
const firer = { xcoord: 0, ycoord: 0, heading: 0 };
const victimNorth = { xcoord: 0, ycoord: -2 };
// Victim at compass bearing ~10° east of north.
const victim10deg = { xcoord: 2 * Math.sin((10 * Math.PI) / 180), ycoord: -2 * Math.cos((10 * Math.PI) / 180) };

describe('lineOfFire focus-based cone (GECMDS.C:954 smallest < focus+PHABIAS)', () => {
  it('focus 0 ⇒ ±2° cone: hits dead-ahead target', () => {
    expect(lineOfFire(firer, victimNorth, 0, 0)).toBe(true);
  });
  it('focus 0 ⇒ ±2° cone: MISSES a target 10° off-axis', () => {
    expect(lineOfFire(firer, victim10deg, 0, 0)).toBe(false);
  });
  it('focus 5 ⇒ ±7° cone: still misses a target 10° off-axis', () => {
    expect(lineOfFire(firer, victim10deg, 0, 5)).toBe(false);
  });
  it('relative degree aims the beam: bearing 10 with focus 0 hits the 10°-off target', () => {
    expect(lineOfFire(firer, victim10deg, 10, 0)).toBe(true);
  });
});

describe('discriminates old (beamWidth+PHABIAS)/2 vs new focus+PHABIAS cone', () => {
  // Victims placed at precise off-axis angles using the same construction:
  // distance 2, angle θ east of north: {xcoord: 2*sin(θ*π/180), ycoord: -2*cos(θ*π/180)}
  const victim5deg = { xcoord: 2 * Math.sin((5 * Math.PI) / 180), ycoord: -2 * Math.cos((5 * Math.PI) / 180) };
  const victim1_5deg = { xcoord: 2 * Math.sin((1.5 * Math.PI) / 180), ycoord: -2 * Math.cos((1.5 * Math.PI) / 180) };
  const victim8deg = { xcoord: 2 * Math.sin((8 * Math.PI) / 180), ycoord: -2 * Math.cos((8 * Math.PI) / 180) };

  it('focus 5, target 5° off-axis: NEW formula (half-angle 7°) includes it; OLD (3.5°) would exclude it', () => {
    // With new formula: diff=5 < 5+2=7 ✓
    // With old formula: diff=5 < (5+2)/2=3.5 ✗ (would FAIL)
    expect(lineOfFire(firer, victim5deg, 0, 5)).toBe(true);
  });

  it('focus 0, target 1.5° off-axis: NEW formula (half-angle 2°) includes it; OLD (1°) would exclude it', () => {
    // With new formula: diff=1.5 < 0+2=2 ✓
    // With old formula: diff=1.5 < (0+2)/2=1 ✗ (would FAIL)
    expect(lineOfFire(firer, victim1_5deg, 0, 0)).toBe(true);
  });

  it('focus 5, target 8° off-axis: NEW formula (half-angle 7°) excludes it; confirms real cone bound', () => {
    // With new formula: diff=8 < 5+2=7 ✗ (correctly FAILS)
    // Confirms cone still has a hard boundary (not unbounded)
    expect(lineOfFire(firer, victim8deg, 0, 5)).toBe(false);
  });
});
