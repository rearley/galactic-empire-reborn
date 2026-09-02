/**
 * Balance regression test — pins every constant from midnight.constants.ts to its
 * exact value derived from the original C source. Any accidental change to a
 * constant causes this suite to fail immediately.
 *
 * SC-006: "Every balance constant in GEMAIN.H that affects gameplay must have a
 *          test that fails if the constant changes."
 *
 * @see GEMAIN.C:478  — teambonus
 * @see GEMAIN.C:497  — maildays
 * @see GEMAIN.C:593  — pltvcash
 * @see GEMAIN.C:596  — pltvdiv
 * @see GEMAIN.C:605  — chgloser
 * @see GEMAIN.H:240  — MAXTEAMS
 * @see GEMAIN.H:222  — MAIL_CLASS_PRODRPT
 */

import {
  TEAMBONU,
  MAILDAYS_DEFAULT,
  PLTVCASH,
  PLTVDIV,
  CHGLOSER_DEFAULT,
  MAXTEAMS,
  MAIL_CLASS_PRODRPT,
  MESG20,
  ADVISORY_LOCK_KEY,
} from '../../../src/game/midnight/midnight.constants';
import { SYSOP_OPTIONS, resolveGameConfig } from '../../../src/game/config/game-config';

describe('midnight balance regression (SC-006)', () => {
  // TEAMBONU is a sysop `.cnf` option, not a fixed #define: C computes
  // `teambonus = numopt(TEAMBONU,0,32000)*100L`. Only the bounds and the ×100
  // scaling are canon, so pin those rather than one operator's chosen value.
  it('TEAMBONU stays within canon bounds and is a multiple of 100', () => {
    expect(TEAMBONU).toBeGreaterThanOrEqual(0n);
    expect(TEAMBONU).toBeLessThanOrEqual(3_200_000n); // 32000 * 100
    expect(TEAMBONU % 100n).toBe(0n);
  });

  it('TEAMBONU scales the configured option by 100', () => {
    expect(BigInt(SYSOP_OPTIONS.TEAMBONU.max) * 100n).toBe(3_200_000n);
    expect(TEAMBONU).toBe(BigInt(resolveGameConfig().TEAMBONU) * 100n);
  });

  it('MAILDAYS_DEFAULT is canon 3, not the port\'s 7', () => {
    expect(MAILDAYS_DEFAULT).toBe(3);
  });

  /**
   * 201,228,378 is the `lngopt` MAX BOUND shared by seven sysop options
   * (GEMAIN.C:557-596), not a value. Pinned as one it made PLTVCASH a ~201x
   * multiplier on banked cash and PLTVDIV large enough to truncate every
   * stockpile to zero. These now hold chosen sysop values, env-overridable,
   * and the regression guard is that they stay in the range where C's
   * expressions are actually divisions.
   * @see test/game/midnight/planet-value-scale.spec.ts
   */
  it('PLTVCASH is a divisor, not the lngopt ceiling', () => {
    expect(PLTVCASH).toBe(1_000);
    expect(Math.floor(1_000_000 / PLTVCASH)).toBeGreaterThan(0);
  });

  it('PLTVDIV is a divisor, not the lngopt ceiling', () => {
    expect(PLTVDIV).toBe(10_000);
    expect(PLTVDIV).toBeLessThan(201_228_378);
  });

  it('CHGLOSER_DEFAULT is canon 2 percent, not the numopt ceiling of 100', () => {
    expect(CHGLOSER_DEFAULT).toBe(2);
  });

  it('MAXTEAMS = 50', () => {
    expect(MAXTEAMS).toBe(50);
  });

  it('MAIL_CLASS_PRODRPT = 3', () => {
    expect(MAIL_CLASS_PRODRPT).toBe(3);
  });

  it('MESG20 = 20', () => {
    expect(MESG20).toBe(20);
  });

  it('ADVISORY_LOCK_KEY = 0x474D6E6967687400n', () => {
    expect(ADVISORY_LOCK_KEY).toBe(0x474D6E6967687400n);
  });
});
