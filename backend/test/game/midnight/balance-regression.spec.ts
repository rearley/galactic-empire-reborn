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

describe('midnight balance regression (SC-006)', () => {
  it('TEAMBONU = 3_200_000n (32000 * 100)', () => {
    expect(TEAMBONU).toBe(3_200_000n);
  });

  it('MAILDAYS_DEFAULT = 7', () => {
    expect(MAILDAYS_DEFAULT).toBe(7);
  });

  it('PLTVCASH = 201_228_378', () => {
    expect(PLTVCASH).toBe(201_228_378);
  });

  it('PLTVDIV = 201_228_378', () => {
    expect(PLTVDIV).toBe(201_228_378);
  });

  it('CHGLOSER_DEFAULT = 100', () => {
    expect(CHGLOSER_DEFAULT).toBe(100);
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
