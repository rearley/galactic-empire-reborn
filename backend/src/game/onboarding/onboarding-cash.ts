import { START_CASH } from '../constants/onboarding';

/**
 * The `User` fields to write when a captain is given a hull through onboarding.
 *
 * This path serves a brand-new account AND the empty-fleet rebuild for a
 * captain who lost their whole fleet. It used to set `cash: START_CASH`
 * unconditionally, so dying wiped a banked balance down to the starting
 * stipend — and topped a bankrupt captain back up to it.
 *
 * C hands out the free replacement hull without touching the bank:
 * `if (noships == 0) { initshp(...); gepdb(GEADD, ...); prfmsg(FIRSTIME); }`
 * (GEFUNCS.C:106-113). The user record is loaded and left alone.
 *
 * `topshipno === 0` is the only reliable "never owned a hull" signal — ship
 * numbers are never reused, so it stays 0 exactly until the first ship exists.
 */
export function onboardingUserUpdate(
  topshipno: number,
  newShipno: number,
): { cash?: bigint; noships: number; topshipno: number } {
  const firstEver = topshipno === 0;
  return firstEver
    ? { cash: START_CASH, noships: 1, topshipno: newShipno }
    : { noships: 1, topshipno: newShipno };
}
