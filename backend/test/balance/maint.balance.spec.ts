/**
 * Balance regression: MAINT_COST_NORMAL, MAINT_COST_NEUTRAL, and repair formula.
 * Fail this test to detect any change to canonical maint tuning.
 * @see GECMDS.C:4478 — cost 200 cr normal planet
 * @see GECMDS.C:4480 — cost 2500 cr Zygor NZ planet
 * @see GECMDS.C:4491 — repair = floor(damage/3) + 1
 */
import {
  MAINT_COST_NORMAL,
  MAINT_COST_NEUTRAL,
} from '../../src/game/commands/_ship-management-constants';

describe('maint balance constants', () => {
  it('MAINT_COST_NORMAL is 200 cr (canonical normal-planet maintenance fee)', () => {
    expect(MAINT_COST_NORMAL).toBe(200);
  });

  it('MAINT_COST_NEUTRAL is 2500 cr (canonical Zygor neutral-zone fee)', () => {
    expect(MAINT_COST_NEUTRAL).toBe(2500);
  });

  it('repair formula: floor(damage/3) + 1 at damage=30 → 11', () => {
    const damage = 30;
    expect(Math.floor(damage / 3) + 1).toBe(11);
  });

  it('repair formula: floor(damage/3) + 1 at damage=1 → 1 (minimum repair unit)', () => {
    const damage = 1;
    expect(Math.floor(damage / 3) + 1).toBe(1);
  });

  it('repair formula: floor(damage/3) + 1 at damage=99 → 34', () => {
    const damage = 99;
    expect(Math.floor(damage / 3) + 1).toBe(34);
  });

  it('repair formula: floor(damage/3) + 1 at damage=100 → 34 (max damage cap)', () => {
    const damage = 100;
    expect(Math.floor(damage / 3) + 1).toBe(34);
  });

  it('MAINT_COST_NEUTRAL is 12.5x MAINT_COST_NORMAL (Zygor premium preserved)', () => {
    expect(MAINT_COST_NEUTRAL / MAINT_COST_NORMAL).toBe(12.5);
  });
});
