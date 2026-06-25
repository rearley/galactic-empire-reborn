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
