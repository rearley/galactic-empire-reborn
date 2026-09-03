import {
  missileFluxCost,
  missileFluxShort,
  missileShakeWarp,
} from '../../../src/game/combat/combat-math';
import { MISENGFC, MOVENGMIN } from '../../../src/game/constants';
import { Random } from '../../../src/game/combat/random.port';

function fixedRandom(...values: number[]): Random {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] } as Random;
}

/**
 * `eng_flu = energy/misengfc;`  — GECMDS.C:1278
 *
 * `energy` there is the *charge* argument (an unsigned int) and `misengfc` is
 * an int, so this is C integer division: it truncates.
 */
describe('missileFluxCost — GECMDS.C:1278', () => {
  it('truncates like C unsigned division', () => {
    expect(missileFluxCost(100, MISENGFC)).toBe(1);
    expect(missileFluxCost(199, MISENGFC)).toBe(1);
    expect(missileFluxCost(50_000, MISENGFC)).toBe(500);
  });

  it('is ZERO for any charge below misengfc — the free-shot band is canon', () => {
    expect(missileFluxCost(99, MISENGFC)).toBe(0);
    expect(missileFluxCost(1, MISENGFC)).toBe(0);
  });
});

/**
 * `if (eng_flu > 0 && eng_flu >= (warsptr->energy+MOVENGMIN))` — GECMDS.C:1280
 */
describe('missileFluxShort — GECMDS.C:1280 (MISSHRT gate)', () => {
  it('never fires on a zero flux cost, however empty the pile', () => {
    expect(missileFluxShort(0, 0)).toBe(false);
    expect(missileFluxShort(0, -10_000)).toBe(false);
  });

  it('refuses when the cost reaches energy + MOVENGMIN', () => {
    expect(missileFluxShort(4000, 1000)).toBe(true); // 4000 >= 1000+3000
    expect(missileFluxShort(4001, 1000)).toBe(true);
  });

  it('ALLOWS the overdraft band below energy + MOVENGMIN', () => {
    // C adds MOVENGMIN rather than subtracting it, so a shot may leave the
    // pile up to MOVENGMIN-1 in the red.
    expect(missileFluxShort(3999, 1000)).toBe(false);
    expect(missileFluxShort(MOVENGMIN - 1, 0)).toBe(false);
    expect(missileFluxShort(MOVENGMIN, 0)).toBe(true);
  });
});

/**
 * `if ((ptr->speed + accelrate)/1000 >= (4 + gernd()%4))` — GEFUNCS.C:506
 */
describe('missileShakeWarp — GEFUNCS.C:506', () => {
  it('rolls 4..7 inclusive', () => {
    expect(missileShakeWarp(fixedRandom(0))).toBe(4);
    expect(missileShakeWarp(fixedRandom(0.25))).toBe(5);
    expect(missileShakeWarp(fixedRandom(0.5))).toBe(6);
    expect(missileShakeWarp(fixedRandom(0.999999))).toBe(7);
  });
});
